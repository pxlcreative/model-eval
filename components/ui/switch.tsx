"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        // Track
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border-2 transition-all outline-none",
        "after:absolute after:-inset-x-3 after:-inset-y-2",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring",
        "data-disabled:cursor-not-allowed data-disabled:opacity-50",
        // Sizes
        "data-[size=default]:h-5 data-[size=default]:w-11",
        "data-[size=sm]:h-4 data-[size=sm]:w-7",
        // Checked state: primary colour
        "data-checked:border-primary data-checked:bg-primary",
        // Unchecked state: visible neutral track (solid — no opacity modifier)
        "data-unchecked:border-input data-unchecked:bg-input",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          // Thumb — always white/background, clips inside the border padding
          "pointer-events-none block rounded-full bg-background shadow-sm ring-0 transition-transform bg-clip-padding",
          "group-data-[size=default]/switch:h-4 group-data-[size=default]/switch:w-6",
          "group-data-[size=sm]/switch:h-3 group-data-[size=sm]/switch:w-4",
          "data-checked:translate-x-[calc(100%-8px)]",
          "data-unchecked:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
