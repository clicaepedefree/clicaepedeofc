export const formatMultilineString = (notes: string) => {
  const notesLines = notes.split('\n')
  return notesLines.join(' |\n')
}
