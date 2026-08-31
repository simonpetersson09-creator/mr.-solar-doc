import { forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useNumericField } from "@/hooks/use-numeric-field";

export interface NumericFieldProps {
  id?: string;
  /** Committed value from the store (null = nothing entered). */
  value: number | null;
  onCommit: (value: number | null) => void;
  /** Active UI locale — only used to resolve ambiguous input like "1.234". */
  locale?: string | null;
  allowNegative?: boolean;
  allowDecimal?: boolean;
  min?: number;
  max?: number;
  decimals?: number;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  /**
   * Unit shown next to the field. Units and currency codes are NEVER part of
   * the typed text: the user types the number only.
   */
  unit?: string;
  disabled?: boolean;
}

/**
 * The single locale-safe numeric input.
 *
 * Holds the user's raw text (see use-numeric-field) and commits a parsed
 * number. "1 234,5", "1.234,5", "1,234.5" and "1234.5" all commit 1234.5.
 */
export const NumericField = forwardRef<HTMLInputElement, NumericFieldProps>(
  function NumericField(
    {
      id,
      value,
      onCommit,
      locale,
      allowNegative,
      allowDecimal = true,
      min,
      max,
      decimals,
      placeholder,
      className,
      unit,
      disabled,
      ...rest
    },
    ref,
  ) {
    const field = useNumericField({
      value,
      onCommit,
      locale: locale ?? null,
      ...(allowNegative === undefined ? {} : { allowNegative }),
      allowDecimal,
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
      ...(decimals === undefined ? {} : { decimals }),
    });

    const input = (
      <Input
        id={id}
        ref={ref}
        type="text"
        autoComplete="off"
        disabled={disabled ?? false}
        placeholder={placeholder ?? ""}
        aria-label={rest["aria-label"] ?? ""}
        aria-invalid={field.isInvalid}
        className={cn(className)}
        {...field.inputProps}
      />
    );

    if (!unit) return input;
    return (
      <span className="flex items-center gap-1.5">
        {input}
        <span className="shrink-0 text-xs text-white/60">{unit}</span>
      </span>
    );
  },
);
