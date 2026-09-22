import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onChange, value, defaultValue, lang, dir, ...props }, ref) => {
    const isDate = type === "date" || type === "datetime-local"
    const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue)
    const currentValue = value ?? uncontrolledValue
    const hasValue = currentValue !== undefined && currentValue !== null && String(currentValue) !== ""
    const input = (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          isDate && !hasValue && "text-transparent focus:text-foreground",
          className
        )}
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        lang={isDate ? "en-GB" : lang}
        dir={isDate ? "ltr" : dir}
        onChange={(event) => {
          if (value === undefined) setUncontrolledValue(event.target.value)
          onChange?.(event)
        }}
        {...props}
      />
    )
    if (isDate) {
      return (
        <div className="relative w-full">
          {input}
          {!hasValue && (
            <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-muted-foreground" dir="ltr" aria-hidden="true">
              D/M/Y
            </span>
          )}
        </div>
      )
    }
    return (
      input
    )
  }
)
Input.displayName = "Input"

export { Input }