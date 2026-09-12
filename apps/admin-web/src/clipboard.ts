export type ClipboardWriter = {
  writeText(value: string): Promise<void>
}

type CopyOptions = {
  clipboard?: ClipboardWriter
  fallback?: (value: string) => boolean
}

function browserClipboard(): ClipboardWriter | undefined {
  if (typeof navigator === 'undefined') return undefined
  return navigator.clipboard
}

export function legacyCopyText(value: string): boolean {
  if (typeof document === 'undefined') return false

  const field = document.createElement('textarea')
  field.value = value
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  field.style.pointerEvents = 'none'
  document.body.appendChild(field)
  field.select()
  field.setSelectionRange(0, field.value.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    field.remove()
  }
}

export async function copyText(value: string, options: CopyOptions = {}): Promise<boolean> {
  const clipboard = options.clipboard ?? browserClipboard()
  if (clipboard) {
    try {
      await clipboard.writeText(value)
      return true
    } catch {
      // HTTP pages and denied Clipboard permissions must fall back to the
      // user-gesture-compatible legacy copy operation below.
    }
  }

  return (options.fallback ?? legacyCopyText)(value)
}
