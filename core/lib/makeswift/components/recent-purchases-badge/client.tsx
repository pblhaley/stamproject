'use client';

import { Flame, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

export interface RecentPurchasesBadgeProps {
  className?: string;
  productId?: number;
  message?: string;
  variant?: 'default' | 'minimal' | 'prominent';
  icon?: 'flame' | 'bag' | 'trending' | 'users' | 'none';
  showThreshold?: number;
  refreshInterval?: number;
  timePeriod?: '24h' | 'week' | 'month';
}

interface ApiResponse {
  count: number;
}

const iconMap = {
  flame: Flame,
  bag: ShoppingBag,
  trending: TrendingUp,
  users: Users,
  none: null,
};

const defaultMessages = {
  '24h': '{count} purchased in the last 24 hours',
  week: '{count} purchased this week',
  month: '{count} purchased this month',
};

export function RecentPurchasesBadge({
  className = '',
  productId,
  message,
  variant = 'default',
  icon = 'flame',
  showThreshold = 1,
  refreshInterval = 0,
  timePeriod = '24h',
}: RecentPurchasesBadgeProps) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPurchaseCount = useCallback(async () => {
    if (!productId) {
      setLoading(false);

      return;
    }

    try {
      const response = await fetch(
        `/api/bigcommerce/recent-purchases?productId=${productId}&period=${timePeriod}`,
      );

      if (!response.ok) {
        throw new Error('Failed to fetch purchase count');
      }

      const data: ApiResponse = await response.json();

      setCount(data.count);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setCount(null);
    } finally {
      setLoading(false);
    }
  }, [productId, timePeriod]);

  useEffect(() => {
    void fetchPurchaseCount();

    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        void fetchPurchaseCount();
      }, refreshInterval * 1000);

      return () => clearInterval(interval);
    }

    return undefined;
  }, [fetchPurchaseCount, refreshInterval]);

  if (loading || error || !productId || count === null || count < showThreshold) {
    return null;
  }

  const IconComponent = icon !== 'none' ? iconMap[icon] : null;
  const displayMessage = (message || defaultMessages[timePeriod]).replace(
    '{count}',
    count.toString(),
  );

  const variantStyles = {
    default: {
      backgroundColor: '#fffbeb',
      color: '#92400e',
      border: '1px solid #fde68a',
    },
    minimal: {
      backgroundColor: 'transparent',
      color: '#4b5563',
    },
    prominent: {
      background: 'linear-gradient(to right, #f97316, #ef4444)',
      color: '#ffffff',
      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    },
  };

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        borderRadius: '9999px',
        fontSize: '14px',
        fontWeight: 500,
        ...variantStyles[variant],
      }}
    >
      {IconComponent && <IconComponent style={{ width: '16px', height: '16px' }} />}
      <span>{displayMessage}</span>
    </div>
  );
}