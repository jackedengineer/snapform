// What an embedded form tells its host page (see public/embed.js): its height
// and nothing else, never answers or position.
export function resizeMessage(height: number) {
  return { type: 'snapform:resize', height: Math.ceil(height) } as const;
}
