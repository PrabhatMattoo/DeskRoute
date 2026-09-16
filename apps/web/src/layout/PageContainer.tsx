import { cn } from '@/lib/utils'

type Size = 'page' | 'form'

/**
 * The two measures in the product. `form` is the settings measure, `page` a
 * touch wider for lists and tables. Both are named in `index.css`.
 */
const sizeWidth: Record<Size, string> = {
  page: 'max-w-page',
  form: 'max-w-form',
}

interface PageContainerProps {
  children: React.ReactNode
  className?: string
  size?: Size
}

export function PageContainer({
  children,
  className,
  size = 'page',
}: PageContainerProps) {
  return (
    <div
      className={cn('@container mx-auto w-full px-7 py-7', sizeWidth[size], className)}
    >
      {children}
    </div>
  )
}
