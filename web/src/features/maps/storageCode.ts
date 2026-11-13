/** A storage location code suggested from the endpoint name: "Shelf D 01" → "SHELF-D-01". */
export function suggestStorageCode(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, '-').slice(0, 100)
}
