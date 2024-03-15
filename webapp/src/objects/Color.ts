export function findClosestColor(hex: string): string {
// Convert input hex string to number
  const inputHexNum = parseInt(hex, 16);

  // Initialize variables to track the closest hex string and its difference
  let closestHex: string = '';
  let smallestDifference: number = Infinity;

  // Iterate over the array of hex strings
  for (const hexString of sessionColor) {
    // Convert current hex string to number
    const hexNum = parseInt(hexString.replace("#", ""), 16);

    // Calculate the absolute difference
    const difference = Math.abs(inputHexNum - hexNum);

    // Update closest hex string if current difference is smaller
    if (difference < smallestDifference) {
      closestHex = hexString;
      smallestDifference = difference;
    }
  }

  // Return the closest hex string
  return closestHex;
}

export const sessionColor: string[] = [
  "#32D499",
  "#32CAD4",
  "#327DD4",
  "#9632D4",
  "#D132D4",
  "#D43289",
  "#D4324F",
  "#D43232",
  "#32D45F",
  "#32D438",
  "#83D432",
  "#BDD432",
  "#D49332",
  "#D47632",
  "#D45932",
  "#D44F32",
  "#D37070",
  "#D3A070",
  "#ADD370",
  "#70D37A",
  "#7092D3",
  "#9C70D3",
  "#D370C9",
  "#D37082",
  "#D37070",
]