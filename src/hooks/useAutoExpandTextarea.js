import { useRef, useEffect } from 'react';

export const useAutoExpandTextarea = (value) => {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      // Reset height to auto to get the correct scrollHeight
      ref.current.style.height = 'auto';
      // Set height to scrollHeight
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  }, [value]);

  return ref;
};
