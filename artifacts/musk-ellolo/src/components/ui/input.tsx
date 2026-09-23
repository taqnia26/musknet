import * as React from "react"
import { toLatinDigits } from "@/lib/formatters"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onChange, value, defaultValue, lang, dir, inputMode, ...props }, ref) => {
    const isDate = type === "date" || type === "datetime-local"
    const isNumber = type === "number"
    const isNumericText = type === "tel" || ((type === undefined || type === "text") && (inputMode === "numeric" || inputMode === "decimal"))
    const normalize = (text: string) => {
      const digits = toLatinDigits(text)
      return inputMode === "decimal" ? digits.replace(/\u066b/g, ".") : digits
    }
    const displayValue = isNumericText && typeof value === "string" ? normalize(value) : value
    const displayDefaultValue = isNumericText && typeof defaultValue === "string" ? normalize(defaultValue) : defaultValue
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
        value={displayValue}
        defaultValue={displayDefaultValue}
        inputMode={inputMode}
        lang={isDate ? "en-GB" : isNumber || isNumericText ? "en-US" : lang}
        dir={isDate || isNumber || isNumericText ? "ltr" : dir}
        onChange={(event) => {
          if (isNumericText) {
            const normalized = normalize(event.currentTarget.value)
            if (normalized !== event.currentTarget.value) {
              const start = event.currentTarget.selectionStart
              const end = event.currentTarget.selectionEnd
              event.currentTarget.value = normalized
              if (start !== null && end !== null) event.currentTarget.setSelectionRange(start, end)
            }
          }
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