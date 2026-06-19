export default function Icon({ name, fill = false, size = 20, className = '' }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: `${size}px`,
        ...(fill && { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }),
      }}
    >
      {name}
    </span>
  )
}
