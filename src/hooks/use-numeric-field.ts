import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatNumericForEdit,
  parseNumericInput,
  sanitizeNumericInput,
  type NumericInputOptions,
  type NumericInputStatus,
} from "@/lib/numeric-input";

export interface UseNumericFieldOptions extends NumericInputOptions {
  /** The committed value owned by the store. */
  value: number | null;
  /** Called when the field holds a complete value (or is cleared). */
  onCommit: (value: number | null) => void;
  /** Commit while typing as soon as the string is a complete number. */
  commitWhileTyping?: boolean;
  /** Decimals used when the committed value is written back into the field. */
  decimals?: number;
}

export interface NumericFieldApi {
  /** Bind to the input: `<Input {...field.inputProps} />`. */
  inputProps: {
    value: string;
    inputMode: "decimal" | "numeric";
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur: () => void;
  };
  /** Current display string. */
  text: string;
  status: NumericInputStatus;
  /** Parsed value of the current text, or null while incomplete/invalid. */
  parsed: number | null;
  /** True when the text is neither empty nor parseable. */
  isInvalid: boolean;
  /** Replace the text programmatically (e.g. when a preset is picked). */
  setValue: (value: number | null) => void;
}

/**
 * Controlled numeric field with a separate display string.
 *
 * The user's text is authoritative while the field is focused: nothing is
 * reformatted, clamped or coerced mid-typing. On blur the text is parsed once,
 * clamped into [min, max] and written back in a canonical, re-editable form.
 * An external value change (country switch, reset) refreshes the text only
 * when it does not match what is already displayed.
 */
export function useNumericField(options: UseNumericFieldOptions): NumericFieldApi {
  const {
    value,
    onCommit,
    commitWhileTyping = true,
    decimals = 4,
    allowDecimal = true,
    allowNegative = false,
    locale = null,
    min,
    max,
  } = options;

  const [text, setText] = useState(() => formatNumericForEdit(value, locale, decimals));
  const focusedRef = useRef(false);
  const lastCommittedRef = useRef<number | null>(value);

  // External changes win only when the field is not being edited and the
  // displayed text no longer represents the stored value.
  useEffect(() => {
    if (focusedRef.current) return;
    if (value === lastCommittedRef.current) return;
    lastCommittedRef.current = value;
    setText(formatNumericForEdit(value, locale, decimals));
  }, [value, locale, decimals]);

  const parse = useCallback(
    (raw: string) =>
      parseNumericInput(raw, {
        allowNegative,
        locale,
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      }),
    [allowNegative, locale, min, max],
  );

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      focusedRef.current = true;
      const next = sanitizeNumericInput(event.target.value, { allowNegative, allowDecimal });
      setText(next);
      if (!commitWhileTyping) return;
      const result = parse(next);
      if (result.status === "empty") {
        lastCommittedRef.current = null;
        onCommit(null);
      } else if (result.status === "ok" && !result.clamped) {
        // Clamping is deferred to blur so typing "1" on the way to "15" is not
        // rewritten to the minimum.
        lastCommittedRef.current = result.value;
        onCommit(result.value);
      }
    },
    [allowDecimal, allowNegative, commitWhileTyping, onCommit, parse],
  );

  const onBlur = useCallback(() => {
    focusedRef.current = false;
    const result = parse(text);
    if (result.status === "empty" || result.status === "invalid") {
      const fallback = result.status === "empty" ? null : lastCommittedRef.current;
      lastCommittedRef.current = fallback;
      setText(formatNumericForEdit(fallback, locale, decimals));
      onCommit(fallback);
      return;
    }
    if (result.status === "incomplete") {
      // "12," is a complete-enough 12 once the user leaves the field.
      const salvaged = parseNumericInput(text.replace(/[.,]+$/, ""), {
        allowNegative,
        locale,
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      });
      const next = salvaged.status === "ok" ? salvaged.value : lastCommittedRef.current;
      lastCommittedRef.current = next;
      setText(formatNumericForEdit(next, locale, decimals));
      onCommit(next);
      return;
    }
    lastCommittedRef.current = result.value;
    setText(formatNumericForEdit(result.value, locale, decimals));
    onCommit(result.value);
  }, [allowNegative, decimals, locale, max, min, onCommit, parse, text]);

  const setValue = useCallback(
    (next: number | null) => {
      lastCommittedRef.current = next;
      setText(formatNumericForEdit(next, locale, decimals));
      onCommit(next);
    },
    [decimals, locale, onCommit],
  );

  const result = parse(text);
  return {
    inputProps: {
      value: text,
      inputMode: allowDecimal ? "decimal" : "numeric",
      onChange,
      onBlur,
    },
    text,
    status: result.status,
    parsed: result.value,
    isInvalid: result.status === "invalid",
    setValue,
  };
}
