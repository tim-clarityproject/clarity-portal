import { forwardRef, useRef } from 'react';
import { IconButton } from './Button';
import './design.css';

// A search box (Phase 5 step 4: My Plans and My Reviews). The shared field
// look (TextField's .ds-field: box colour, coral edge on focus, 17px, never
// under 16px), with the 45 degree crosshair (IconButton) at its right end
// once something is typed, which clears it and puts the cursor back in the
// box. It sits with the list it changes, never at the top of the page.
//
// label: what a screen reader says ("Search my plans"); placeholder: the
// grey words in the empty box. The caller does the searching.
const SearchField = forwardRef(function SearchField(
  { label, value = '', onChange, placeholder, className = '', ...rest },
  ref,
) {
  const own = useRef(null);
  const input = ref || own;
  return (
    <div className={`ds-search ${className}`.trim()} role="search">
      <input
        ref={input}
        type="search"
        className="ds-field ds-search-input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange?.('');
          }
        }}
        {...rest}
      />
      {value && (
        <IconButton
          label="Clear the search"
          className="ds-search-clear"
          onClick={() => {
            onChange?.('');
            input.current?.focus();
          }}
        />
      )}
    </div>
  );
});

export default SearchField;
