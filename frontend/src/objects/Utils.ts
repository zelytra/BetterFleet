export abstract class Utils {
    public static generateRandomColor(): string {
        // Generate random color components
        const r = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
        const g = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
        const b = Math.floor(Math.random() * 256).toString(16).padStart(2, '0');

        // Append '80' to the hex value for 50% opacity
        const opacity = '80';

        return `#${r}${g}${b}${opacity}`;
    }
}
