// Same hand-rolled joiner the public app uses (src/utils/cn.ts). There is no
// tailwind-merge here either, so component variants are first-class props
// rather than something callers override with a className.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}
