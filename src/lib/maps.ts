// Google Maps navigation link. No origin on purpose: Maps then starts from the device's current
// location, which is where the user actually sets off from.
export function directionsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
