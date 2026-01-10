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
    timePeriod: Select({
      label: "Time Period",
      options: [
        { value: "24h", label: "Last 24 Hours" },
        { value: "week", label: "This Week" },
        { value: "month", label: "This Month" },
      ],
      defaultValue: "24h",
    }),
    message: TextInput({
      label: "Custom Message (optional)",
      defaultValue: "",
      selectAll: true,
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
