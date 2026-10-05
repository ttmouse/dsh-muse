declare module 'react' {
  export function createElement(
    type: string,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): any

  export function useState<T>(initial: T): [T, (next: T | ((current: T) => T)) => void]
}
