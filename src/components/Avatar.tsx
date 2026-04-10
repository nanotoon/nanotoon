export function Avatar({ name, url, size = 36, className = '' }: {
  name: string
  url?: string | null
  size?: number
  className?: string
}) {
  const sizeClass = {
    24: 'w-6 h-6',
    28: 'w-7 h-7',
    32: 'w-8 h-8',
    36: 'w-9 h-9',
    45: 'w-[45px] h-[45px]',
    68: 'w-[68px] h-[68px]',
  }[size] || `w-[${size}px] h-[${size}px]`

  return (
    <img
      src={url || '/default-avatar.jpg'}
      alt={name}
      className={`${sizeClass} rounded-full object-cover shrink-0 ${className}`}
    />
  )
}
