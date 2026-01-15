# Icon Generation Instructions

The icon.svg file has been created with a simple clock design:
- Dark background (#0f172a) matching the app theme
- Cyan clock outline (#00bcd4) matching the accent color
- Clock hands showing approximately 10:10

To generate PNG icons for different platforms:

1. **For Windows (icon.ico)**:
   - Convert SVG to PNG at 256x256
   - Use an online tool like https://convertio.co/svg-ico/
   - Save as `build/icon.ico`

2. **For macOS (icon.icns)**:
   - Convert SVG to PNG at 512x512
   - Use Icon Set Creator or similar tool
   - Save as `build/icon.icns`

3. **For Linux (icon.png)**:
   - Convert SVG to PNG at 512x512
   - Save as `build/icon.png`

4. **For development (icon.png)**:
   - Convert SVG to PNG at 256x256
   - Save as `assets/icon.png`

Note: For production, consider hiring a designer to create a professional icon.