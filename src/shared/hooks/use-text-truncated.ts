import { RefObject, useEffect, useState } from 'react'

/**
 * Hook to detect if an element's content is truncated (e.g., via line-clamp or overflow).
 * Compares scrollHeight vs clientHeight to determine if content overflows.
 *
 * @param ref - React ref to the element to check for truncation
 * @param deps - Optional dependency array to trigger re-check (e.g., when content changes)
 * @returns boolean indicating if the element's content is truncated
 */
export function useTextTruncated<T extends HTMLElement>(
  ref: RefObject<T | null>,
  deps: unknown[] = []
): boolean {
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    const checkTruncation = () => {
      if (ref.current) {
        setIsTruncated(ref.current.scrollHeight > ref.current.clientHeight)
      }
    }

    checkTruncation()
    window.addEventListener('resize', checkTruncation)
    return () => window.removeEventListener('resize', checkTruncation)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps])

  return isTruncated
}
