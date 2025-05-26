import { cn } from '@/shared/lib/utils'
import { Image as ImageIcon } from 'lucide-react'
import Image from 'next/image'

export type ImageWithPlaceholderProps = {
  image?: { url: string } | null
  alt: string
  className?: string
  iconClassName?: string
  size?: number
}

export function ImageWithPlaceholder({ image, alt, className, iconClassName, size = 56 }: ImageWithPlaceholderProps) {
  return (
    <div
      className={cn('rounded-md overflow-hidden bg-primary/10 border border-slate-200', className)}
      style={{ height: `${size}px`, width: `${size}px` }}
    >
      {image ? (
        <Image src={image.url} alt={alt} width={size} height={size} className="w-full h-full" />
      ) : (
        <div className="flex items-center justify-center h-full">
          <ImageIcon className={cn('h-6 w-6 text-primary/60', iconClassName)} />
        </div>
      )}
    </div>
  )
}

export default ImageWithPlaceholder
