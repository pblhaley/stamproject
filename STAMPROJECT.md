# Recent Purchases Badge - Developer Documentation

A dynamic component for BigCommerce Catalyst storefronts with Makeswift integration. Displays real-time purchase counts for products within configurable time periods.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [File Structure](#file-structure)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Component Logic Walkthrough](#component-logic-walkthrough)
6. [Usage](#usage)
7. [Customization](#customization)
8. [Troubleshooting](#troubleshooting)
9. [Issues Encountered & Resolutions](#issues-encountered--resolutions)

---

## Prerequisites

- BigCommerce Catalyst storefront with Makeswift integration
- Node.js 18+
- BigCommerce store with API access
- The following environment variables:
  - `BIGCOMMERCE_STORE_HASH` - Your BigCommerce store hash
  - `BIGCOMMERCE_ACCESS_TOKEN` - API token with **read** access to Orders

### Obtaining BigCommerce Credentials

1. Log in to your BigCommerce dashboard
2. Navigate to **Settings → API → Store-level API accounts**
3. Create a new API account with **read** permission for **Orders**
4. Copy the `Store Hash` and `Access Token`

---

## File Structure

```
core/
├── app/
│   └── api/
│       └── bigcommerce/
│           └── recent-purchases/
│               └── route.ts          # API endpoint for fetching order data
├── lib/
│   └── makeswift/
│       └── components/
│           └── recent-purchases-badge/
│               ├── client.tsx        # React component
│               └── register.ts       # Makeswift registration
```

---

## Installation

### Step 1: Create the API Route

Create `core/app/api/bigcommerce/recent-purchases/route.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server"

const BIGCOMMERCE_STORE_HASH = process.env.BIGCOMMERCE_STORE_HASH
const BIGCOMMERCE_ACCESS_TOKEN = process.env.BIGCOMMERCE_ACCESS_TOKEN

interface OrderProduct {
  product_id: number
  quantity: number
}

interface Order {
  id: number
  date_created: string
  status_id: number
  products: { url: string }
}

const cache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 60 * 1000 // 1 minute cache

function getMinDate(period: string): string {
  const now = new Date()
  switch (period) {
    case "week":
      now.setDate(now.getDate() - 7)
      break
    case "month":
      now.setDate(now.getDate() - 30)
      break
    case "24h":
    default:
      now.setHours(now.getHours() - 24)
      break
  }
  return now.toISOString()
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")
  const period = searchParams.get("period") || "24h"

  if (!productId) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
  }

  const cacheKey = `purchases_${productId}_${period}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  if (!BIGCOMMERCE_STORE_HASH || !BIGCOMMERCE_ACCESS_TOKEN) {
    console.warn("BigCommerce credentials not configured, returning mock data")
    const mockData = {
      count: Math.floor(Math.random() * 50) + 5,
      productId,
      period,
      lastUpdated: new Date().toISOString(),
      isMock: true,
    }
    return NextResponse.json(mockData)
  }

  try {
    const count = await fetchRecentPurchaseCount(productId, period)

    const responseData = {
      count,
      productId,
      period,
      lastUpdated: new Date().toISOString(),
    }

    cache.set(cacheKey, { data: responseData, timestamp: Date.now() })
    return NextResponse.json(responseData)
  } catch (error) {
    console.error("Error fetching BigCommerce orders:", error)
    return NextResponse.json({ error: "Failed to fetch purchase data" }, { status: 500 })
  }
}

async function fetchRecentPurchaseCount(productId: string, period: string): Promise<number> {
  const baseUrl = `https://api.bigcommerce.com/stores/${BIGCOMMERCE_STORE_HASH}/v2`
  const minDateCreated = getMinDate(period)

  const ordersResponse = await fetch(
    `${baseUrl}/orders?min_date_created=${encodeURIComponent(minDateCreated)}&limit=250`,
    {
      headers: {
        "X-Auth-Token": BIGCOMMERCE_ACCESS_TOKEN!,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    },
  )

  if (!ordersResponse.ok) {
    const errorText = await ordersResponse.text()
    console.error("BigCommerce API error:", errorText)
    throw new Error(`BigCommerce API error: ${ordersResponse.status}`)
  }

  const orders: Order[] = await ordersResponse.json()

  if (!orders || orders.length === 0) {
    return 0
  }

  // Filter for completed/shipped orders (status_id 2, 10, 11)
  const completedOrders = orders.filter((order) => [2, 10, 11].includes(order.status_id))

  let totalCount = 0
  const targetProductId = Number.parseInt(productId, 10)

  await Promise.all(
    completedOrders.map(async (order) => {
      try {
        const productsResponse = await fetch(`${baseUrl}/orders/${order.id}/products`, {
          headers: {
            "X-Auth-Token": BIGCOMMERCE_ACCESS_TOKEN!,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        })

        if (productsResponse.ok) {
          const products: OrderProduct[] = await productsResponse.json()
          products.forEach((product) => {
            if (product.product_id === targetProductId) {
              totalCount += product.quantity
            }
          })
        }
      } catch (err) {
        console.error(`Error fetching products for order ${order.id}:`, err)
      }
    }),
  )

  return totalCount
}
```

### Step 2: Create the Client Component

Create `core/lib/makeswift/components/recent-purchases-badge/client.tsx`:

```tsx
"use client"

import { useState, useEffect, useCallback } from "react"
import { Flame, ShoppingBag, TrendingUp, Users } from "lucide-react"

export interface RecentPurchasesBadgeProps {
  className?: string
  productId?: number
  message?: string
  variant?: "default" | "minimal" | "prominent"
  icon?: "flame" | "bag" | "trending" | "users" | "none"
  showThreshold?: number
  refreshInterval?: number
  timePeriod?: "24h" | "week" | "month"
}

const iconMap = {
  flame: Flame,
  bag: ShoppingBag,
  trending: TrendingUp,
  users: Users,
  none: null,
}

const defaultMessages = {
  "24h": "{count} purchased in the last 24 hours",
  week: "{count} purchased this week",
  month: "{count} purchased this month",
}

export function RecentPurchasesBadge({
  className = "",
  productId,
  message,
  variant = "default",
  icon = "flame",
  showThreshold = 1,
  refreshInterval = 0,
  timePeriod = "24h",
}: RecentPurchasesBadgeProps) {
  const [count, setCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPurchaseCount = useCallback(async () => {
    if (!productId) {
      setLoading(false)
      return
    }

    try {
      const response = await fetch(
        `/api/bigcommerce/recent-purchases?productId=${productId}&period=${timePeriod}`
      )

      if (!response.ok) {
        throw new Error("Failed to fetch purchase count")
      }

      const data = await response.json()
      setCount(data.count)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
      setCount(null)
    } finally {
      setLoading(false)
    }
  }, [productId, timePeriod])

  useEffect(() => {
    fetchPurchaseCount()

    if (refreshInterval > 0) {
      const interval = setInterval(fetchPurchaseCount, refreshInterval * 1000)
      return () => clearInterval(interval)
    }
  }, [fetchPurchaseCount, refreshInterval])

  if (loading || error || !productId || count === null || count < showThreshold) {
    return null
  }

  const IconComponent = icon !== "none" ? iconMap[icon] : null
  const displayMessage = (message || defaultMessages[timePeriod]).replace(
    "{count}",
    count.toString()
  )

  const variantStyles = {
    default: {
      backgroundColor: "#fffbeb",
      color: "#92400e",
      border: "1px solid #fde68a",
    },
    minimal: {
      backgroundColor: "transparent",
      color: "#4b5563",
    },
    prominent: {
      background: "linear-gradient(to right, #f97316, #ef4444)",
      color: "#ffffff",
      boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    },
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        borderRadius: "9999px",
        fontSize: "14px",
        fontWeight: 500,
        ...variantStyles[variant],
      }}
      className={className}
    >
      {IconComponent && <IconComponent style={{ width: "16px", height: "16px" }} />}
      <span>{displayMessage}</span>
    </div>
  )
}
```

### Step 3: Create the Makeswift Registration

Create `core/lib/makeswift/components/recent-purchases-badge/register.ts`:

```ts
import { runtime } from "~/lib/makeswift/runtime"
import { Number, Select, Style, TextInput } from "@makeswift/runtime/controls"
import { RecentPurchasesBadge } from "./client"

runtime.registerComponent(RecentPurchasesBadge, {
  type: "recent-purchases-badge",
  label: "Recent Purchases Badge",
  props: {
    className: Style(),
    productId: Number({
      label: "Product ID",
      defaultValue: 0,
      step: 1,
    }),
    message: TextInput({
      label: "Message (use {count} for number)",
      defaultValue: "",
      selectAll: true,
    }),
    timePeriod: Select({
      label: "Time Period",
      options: [
        { value: "24h", label: "Last 24 Hours" },
        { value: "week", label: "This Week" },
        { value: "month", label: "This Month" },
      ],
      defaultValue: "24h",
    }),
    variant: Select({
      label: "Variant",
      options: [
        { value: "default", label: "Default" },
        { value: "minimal", label: "Minimal" },
        { value: "prominent", label: "Prominent" },
      ],
      defaultValue: "default",
    }),
    icon: Select({
      label: "Icon",
      options: [
        { value: "flame", label: "Flame" },
        { value: "bag", label: "Shopping Bag" },
        { value: "trending", label: "Trending" },
        { value: "users", label: "Users" },
        { value: "none", label: "None" },
      ],
      defaultValue: "flame",
    }),
    showThreshold: Number({
      label: "Show Threshold",
      defaultValue: 1,
      step: 1,
    }),
    refreshInterval: Number({
      label: "Refresh Interval (seconds)",
      defaultValue: 60,
      step: 10,
    }),
  },
})
```

### Step 4: Register the Component

Add the import to `core/lib/makeswift/components.ts`:

```ts
// ... existing imports ...
import './components/recent-purchases-badge/register';
```

### Step 5: Add Environment Variables

Add to `.env.local`:

```env
BIGCOMMERCE_STORE_HASH=your_store_hash
BIGCOMMERCE_ACCESS_TOKEN=your_access_token
```

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BIGCOMMERCE_STORE_HASH` | Your BigCommerce store identifier | Yes |
| `BIGCOMMERCE_ACCESS_TOKEN` | API token with Orders read access | Yes |

### Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `productId` | `number` | - | BigCommerce product entity ID |
| `message` | `string` | Auto-generated based on time period | Custom message with `{count}` placeholder |
| `variant` | `"default" \| "minimal" \| "prominent"` | `"default"` | Visual style variant |
| `icon` | `"flame" \| "bag" \| "trending" \| "users" \| "none"` | `"flame"` | Icon to display |
| `showThreshold` | `number` | `1` | Minimum count to show badge |
| `refreshInterval` | `number` | `0` | Auto-refresh interval in seconds (0 = disabled) |
| `timePeriod` | `"24h" \| "week" \| "month"` | `"24h"` | Time range for counting purchases |

---

## Component Logic Walkthrough

### Data Flow

```
┌─────────────────────┐
│   Product Page      │
│   (page.tsx)        │
└──────────┬──────────┘
           │ productId
           ▼
┌─────────────────────┐
│ RecentPurchasesBadge│
│   (client.tsx)      │
└──────────┬──────────┘
           │ fetch with productId + period
           ▼
┌─────────────────────┐
│   API Route         │
│   (route.ts)        │
└──────────┬──────────┘
           │ REST API call
           ▼
┌─────────────────────┐
│  BigCommerce V2 API │
│  /v2/orders         │
└─────────────────────┘
```

### API Route Logic

1. **Request Validation**: Checks for required `productId` parameter
2. **Cache Check**: Returns cached data if within TTL (1 minute)
3. **Credentials Check**: Returns mock data if BigCommerce credentials are missing
4. **Order Fetching**: Queries BigCommerce V2 Orders API with date filter
5. **Order Filtering**: Filters for completed orders (status 2, 10, 11)
6. **Product Counting**: Iterates order products to count matching product quantities
7. **Response**: Returns count with metadata, caches result

### Client Component Logic

1. **State Management**: Tracks count, loading, and error states
2. **Data Fetching**: Uses `useCallback` + `useEffect` for fetch lifecycle
3. **Auto-refresh**: Optional interval-based refetching
4. **Conditional Rendering**: Hides badge if loading, error, or below threshold
5. **Dynamic Styling**: Uses inline styles (not Tailwind) for color compatibility

---

## Usage

### In Product Detail Pages (Code)

```tsx
import { RecentPurchasesBadge } from '~/lib/makeswift/components/recent-purchases-badge/client';

// Inside your component, with access to product data:
<RecentPurchasesBadge
  productId={baseProduct.entityId}
  variant="prominent"
  timePeriod="24h"
  showThreshold={1}
/>
```

### In Makeswift Visual Editor

1. Open the Makeswift editor
2. Find "Recent Purchases Badge" in the component panel
3. Drag onto your page
4. Configure Product ID and other options in the right panel

### Time Period Options

| Value | Description | Default Message |
|-------|-------------|-----------------|
| `"24h"` | Last 24 hours | "{count} purchased in the last 24 hours" |
| `"week"` | Last 7 days | "{count} purchased this week" |
| `"month"` | Last 30 days | "{count} purchased this month" |

---

## Customization

### Adding New Variants

In `client.tsx`, add to the `variantStyles` object:

```tsx
const variantStyles = {
  // ... existing variants ...
  custom: {
    backgroundColor: "#your-color",
    color: "#text-color",
    border: "1px solid #border-color",
  },
}
```

Then update the `RecentPurchasesBadgeProps` type and the Makeswift registration.

### Adding New Icons

1. Import from `lucide-react`
2. Add to the `iconMap` object
3. Update the `icon` prop type
4. Add option in `register.ts`

### Custom Time Periods

1. Add new option to `getMinDate()` in `route.ts`
2. Add default message in `defaultMessages` in `client.tsx`
3. Update the `timePeriod` prop type
4. Add option in `register.ts`

---

## Troubleshooting

### Badge Not Visible

1. Check browser console for errors
2. Verify API returns data: `http://localhost:3000/api/bigcommerce/recent-purchases?productId=YOUR_ID`
3. Check `showThreshold` - badge hides if count is below threshold
4. Verify inline styles are not being overridden

### API Returns 500 Error

1. Check terminal logs for specific error messages
2. Verify environment variables are set in `core/.env.local`
3. Confirm API token has Orders read permission

### API Returns 400 Error

1. Check for invalid query parameters
2. See "BigCommerce V2 API Limitations" in Issues section

### Makeswift Editor Connection Issues

1. Verify `MAKESWIFT_SITE_API_KEY` is correct
2. Check Host URL in Makeswift dashboard matches `http://localhost:3000`
3. Ensure environment variables are in the correct without typos, quotes, or white space in `.env.local`

---

## Issues Encountered & Resolutions

### 1. BigCommerce API 400 Error - Invalid status_id Field

**Symptom**: API returns `{"status":400,"message":"The field 'status_id' is invalid."}`

**Cause**: The BigCommerce V2 Orders API does not accept comma-separated values for `status_id` filtering.

**Original Code**:
```ts
`${baseUrl}/orders?min_date_created=${minDateCreated}&status_id=2,10,11&limit=250`
```

**Resolution**: Remove `status_id` from query string and filter in JavaScript:
```ts
// Fetch without status filter
`${baseUrl}/orders?min_date_created=${minDateCreated}&limit=250`

// Filter in code
const completedOrders = orders.filter(order => 
  [2, 10, 11].includes(order.status_id)
)
```

---

### 2. Tailwind Gradient Classes Not Rendering

**Symptom**: Badge renders in DOM but appears as unstyled gray box. Tailwind classes like `bg-gradient-to-r from-orange-500 to-red-500` are not applied.

**Cause**: Catalyst's Tailwind configuration doesn't include these color classes in its purge/safelist, so they're removed during build.

**Resolution**: Replace Tailwind color classes with inline styles:
```tsx
// Before (broken)
const variantStyles = {
  prominent: "bg-gradient-to-r from-orange-500 to-red-500 text-white",
}

// After (working)
const variantStyles = {
  prominent: {
    background: "linear-gradient(to right, #f97316, #ef4444)",
    color: "#ffffff",
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  },
}
```

---

### 3. Duplicate Runtime Instance

**Symptom**: Makeswift editor fails to load after adding component

**Cause**: Creating a new `ReactRuntimeCore` instance instead of importing the existing one from the project.

**Resolution**: Import the existing runtime:
```ts
// Correct
import { runtime } from "~/lib/makeswift/runtime"

// Wrong - creates duplicate
import { ReactRuntimeCore } from "@makeswift/runtime"
export const runtime = new ReactRuntimeCore({ ... })
```

---

### 4. Path Alias Mismatch

**Symptom**: Module not found errors

**Cause**: Using `@/` path alias when project uses `~/`

**Resolution**: Check `tsconfig.json` for the correct path alias and use consistently:
```ts
// If project uses ~
import { runtime } from "~/lib/makeswift/runtime"

// If project uses @
import { runtime } from "@/lib/makeswift/runtime"
```

---

## API Reference

### GET /api/bigcommerce/recent-purchases

Fetches purchase count for a product within a time period.

**Query Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `productId` | string | Yes | - | BigCommerce product ID |
| `period` | string | No | `"24h"` | Time period: `"24h"`, `"week"`, `"month"` |

**Response**:
```json
{
  "count": 42,
  "productId": "130",
  "period": "24h",
  "lastUpdated": "2026-01-09T23:04:45.323Z"
}
```

**Mock Response** (when credentials not configured):
```json
{
  "count": 27,
  "productId": "130",
  "period": "24h",
  "lastUpdated": "2026-01-09T23:04:45.323Z",
  "isMock": true
}
