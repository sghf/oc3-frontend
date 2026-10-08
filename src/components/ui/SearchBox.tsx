import { SearchIcon } from "@/components/ui/icons";

/**
 * A field narrowing a list as it is typed, with its magnifier; its placeholder
 * says what it searches, and names it for assistive technologies.
 */
export function SearchBox({
  value,
  onChange,
  label,
  className = "w-64",
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`flex h-8 items-center gap-1.5 rounded-(--radius-control) border border-line bg-surface px-2 text-ink-muted ${className}`}
    >
      <SearchIcon />
      <input
        type="search"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={label}
        aria-label={label}
        className="w-full bg-transparent text-ink outline-none placeholder:text-ink-muted"
      />
    </div>
  );
}
