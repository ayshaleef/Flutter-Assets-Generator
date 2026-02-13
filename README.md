# Flutter Assets Generator 🚀

**Flutter Assets Generator** is a powerful and smart VS Code extension designed to automate the management of your Flutter project assets. It monitors your `assets` folder and automatically generates type-safe Dart classes, updates `pubspec.yaml`, and keeps your project clean and typo-free.



## ✨ Features

- **📁 Auto-Generation**: Automatically generates nested Dart classes based on your `assets` folder structure.
- **⚙️ Customizable Output Path**: Choose exactly where you want your Dart files to be generated via extension settings (Default: `lib/constants/assets`).
- **📝 Smart Pubspec Sync**: Automatically adds/removes subdirectories to your `pubspec.yaml`. It only adds folders that actually contain files.
- **🌲 Nested Directories**: Supports infinite nesting for organized code (e.g., `AssetsApp.images.icons.logo`).
- **🔘 Toggle Auto-Sync**: Easily pause or resume the automatic generation directly from the Editor Title Bar or Command Palette.
- **🖼️ Smart Asset Support**: 
  - Detects `.svg` files and marks them in the code for better visibility.
- **⚡ High Performance**: Uses smart debouncing to prevent editor freezing or flickering when modifying multiple files at once.
- **✅ Status Bar Feedback**: Visual confirmation in the status bar when assets are syncing or successfully synced.

---

## 🚀 How to Use

1. **Create an `assets` folder** in your Flutter project's root directory.
2. **Organize your files** into subfolders (e.g., `assets/images`, `assets/audio`).
3. **The Extension works automatically!** It will scan the folders and create the Dart classes in your specified output directory.
4. **In your Dart code**, use it like this:

```dart
// Import the generated file
import 'package:your_project/constants/assets/assets_app.dart';

// Use your assets safely!
Image.asset(AssetsApp.images.logo);

// Works perfectly with nested folders
SvgPicture.asset(AssetsApp.images.icons.userAvatar);