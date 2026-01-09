import { type NextRequest, NextResponse } from 'next/server';

const BIGCOMMERCE_STORE_HASH = process.env.BIGCOMMERCE_STORE_HASH;
const BIGCOMMERCE_ACCESS_TOKEN = process.env.BIGCOMMERCE_ACCESS_TOKEN;

interface OrderProduct {
  product_id: number;
  quantity: number;
}

interface Order {
  id: number;
  date_created: string;
  status_id: number;
  products: { url: string };
}

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');

  console.log('[v0] API called with productId:', productId);
  console.log('[v0] STORE_HASH exists:', !!BIGCOMMERCE_STORE_HASH);
  console.log('[v0] ACCESS_TOKEN exists:', !!BIGCOMMERCE_ACCESS_TOKEN);

  if (!productId) {
    return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
  }

  const cacheKey = `purchases_${productId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[v0] Returning cached data');
    return NextResponse.json(cached.data);
  }

  if (!BIGCOMMERCE_STORE_HASH || !BIGCOMMERCE_ACCESS_TOKEN) {
    console.log('[v0] Missing credentials, returning mock data');
    const mockData = {
      count: Math.floor(Math.random() * 50) + 5,
      productId,
      period: '24h',
      lastUpdated: new Date().toISOString(),
      isMock: true,
    };
    return NextResponse.json(mockData);
  }

  try {
    console.log('[v0] Fetching from BigCommerce API...');
    const count = await fetchRecentPurchaseCount(productId);
    console.log('[v0] Got count:', count);

    const responseData = {
      count,
      productId,
      period: '24h',
      lastUpdated: new Date().toISOString(),
    };

    cache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    return NextResponse.json(responseData);
  } catch (error) {
    console.error('[v0] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch purchase data' }, { status: 500 });
  }
}

async function fetchRecentPurchaseCount(productId: string): Promise<number> {
  const baseUrl = `https://api.bigcommerce.com/stores/${BIGCOMMERCE_STORE_HASH}/v2`;

  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
  const minDateCreated = twentyFourHoursAgo.toISOString();

  console.log('[v0] Fetching orders from:', `${baseUrl}/orders`);

  const ordersResponse = await fetch(
    `${baseUrl}/orders?min_date_created=${encodeURIComponent(minDateCreated)}&limit=250`,
    {
      headers: {
        'X-Auth-Token': BIGCOMMERCE_ACCESS_TOKEN!,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  );

  console.log('[v0] Orders response status:', ordersResponse.status);

  if (!ordersResponse.ok) {
    const errorText = await ordersResponse.text();
    console.error('[v0] BigCommerce API error:', errorText);
    throw new Error(`BigCommerce API error: ${ordersResponse.status}`);
  }

  const orders: Order[] = await ordersResponse.json();
  console.log('[v0] Found orders:', orders?.length || 0);

  if (!orders || orders.length === 0) {
    return 0;
  }

  const completedOrders = orders.filter((order) => [2, 10, 11].includes(order.status_id));
  console.log('[v0] Completed orders:', completedOrders.length);

  let totalCount = 0;
  const targetProductId = Number.parseInt(productId, 10);

  await Promise.all(
    orders.map(async (order) => {
      try {
        const productsResponse = await fetch(`${baseUrl}/orders/${order.id}/products`, {
          headers: {
            'X-Auth-Token': BIGCOMMERCE_ACCESS_TOKEN!,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        });

        if (productsResponse.ok) {
          const products: OrderProduct[] = await productsResponse.json();
          products.forEach((product) => {
            if (product.product_id === targetProductId) {
              totalCount += product.quantity;
            }
          });
        }
      } catch (err) {
        console.error(`[v0] Error fetching products for order ${order.id}:`, err);
      }
    }),
  );

  return totalCount;
}
