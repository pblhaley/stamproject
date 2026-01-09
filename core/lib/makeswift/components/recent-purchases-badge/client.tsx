'use client';

import { useState, useEffect, useCallback } from 'react';
import { Flame, ShoppingBag, TrendingUp, Users } from 'lucide-react';

export interface RecentPurchasesBadgeProps {
  className?: string;
  productId?: number;
  message?: string;
  variant?: 'default' | 'minimal' | 'prominent';
  icon?: 'flame' | 'bag' | 'trending' | 'users' | 'none';
  showThreshold?: number;
  refreshInterval?: number;
}

const iconMap = {
  flame: Flame,
  bag: ShoppingBag,
  trending: TrendingUp,
  users: Users,
  none: null,
};

export function RecentPurchasesBadge({
  className = '',
  productId,
  message = '{count} purchased in the last 24 hours',
  variant = 'default',
  icon = 'flame',
  showThreshold = 1,
  refreshInterval = 0,
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
      const response = await fetch(`/api/bigcommerce/recent-purchases?productId=${productId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch purchase count');
      }

      const data = await response.json();
      setCount(data.count);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setCount(null);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    fetchPurchaseCount();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchPurchaseCount, refreshInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [fetchPurchaseCount, refreshInterval]);

  if (loading || error || !productId || count === null || count < showThreshold) {
    return null;
  }

  const IconComponent = icon !== 'none' ? iconMap[icon] : null;
  const displayMessage = message.replace('{count}', count.toString());

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

  //console.log("Badge rendering:", { count, productId, displayMessage, variant })

  /* const variantStyles = {
    default: "bg-amber-50 text-amber-800 border border-amber-200",
    minimal: "text-gray-600",
    prominent: "bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg",
  } */

  return (
    <div
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
      className={className}
    >
      {IconComponent && <IconComponent style={{ width: '16px', height: '16px' }} />}
      <span>{displayMessage}</span>
    </div>
  );
}
