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

interface CacheEntry {
  data: {
    count: number;
    productId: string;
    period: string;
    lastUpdated: string;
    isMock?: boolean;
  };
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 1000;

function getMinDate(period: string): string {
  const now = new Date();

  switch (period) {
    case 'week':
      now.setDate(now.getDate() - 7);
      break;

    case 'month':
      now.setDate(now.getDate() - 30);
      break;

    case '24h':
    default:
      now.setHours(now.getHours() - 24);
      break;
  }

  return now.toISOString();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get('productId');
  const period = searchParams.get('period') ?? '24h';

  if (!productId) {
    return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
  }

  const cacheKey = `purchases_${productId}_${period}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  if (!BIGCOMMERCE_STORE_HASH || !BIGCOMMERCE_ACCESS_TOKEN) {
    const mockData = {
      count: Math.floor(Math.random() * 50) + 5,
      productId,
      period,
      lastUpdated: new Date().toISOString(),
      isMock: true,
    };

    return NextResponse.json(mockData);
  }

  try {
    const count = await fetchRecentPurchaseCount(productId, period);

    const responseData = {
      count,
      productId,
      period,
      lastUpdated: new Date().toISOString(),
    };

    cache.set(cacheKey, { data: responseData, timestamp: Date.now() });

    return NextResponse.json(responseData);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching BigCommerce orders:', error);

    return NextResponse.json({ error: 'Failed to fetch purchase data' }, { status: 500 });
  }
}

async function fetchRecentPurchaseCount(productId: string, period: string): Promise<number> {
  const baseUrl = `https://api.bigcommerce.com/stores/${BIGCOMMERCE_STORE_HASH}/v2`;
  const minDateCreated = getMinDate(period);

  const ordersResponse = await fetch(
    `${baseUrl}/orders?min_date_created=${encodeURIComponent(minDateCreated)}&limit=250`,
    {
      headers: {
        'X-Auth-Token': BIGCOMMERCE_ACCESS_TOKEN ?? '',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  );

  if (!ordersResponse.ok) {
    throw new Error(`BigCommerce API error: ${ordersResponse.status}`);
  }

  const orders: Order[] = await ordersResponse.json();

  if (orders.length === 0) {
    return 0;
  }

  const completedOrders = orders.filter((order) => [2, 10, 11].includes(order.status_id));

  let totalCount = 0;
  const targetProductId = Number.parseInt(productId, 10);

  await Promise.all(
    completedOrders.map(async (order) => {
      try {
        const productsResponse = await fetch(`${baseUrl}/orders/${order.id}/products`, {
          headers: {
            'X-Auth-Token': BIGCOMMERCE_ACCESS_TOKEN ?? '',
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
        // eslint-disable-next-line no-console
        console.error(`Error fetching products for order ${order.id}:`, err);
      }
    }),
  );

  return totalCount;
}