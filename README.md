# SelfieBooth

An AI-powered interactive Selfie Booth web application built with React, Vite, and TypeScript.

## 🌟 Features

- **Live Camera Integration:** Captures high-quality frames from the user's webcam using `react-webcam`.
- **AI Person Segmentation:** Real-time person cutout (background removal) powered by `@mediapipe/selfie_segmentation` and `@imgly/background-removal`.
- **Dynamic Backgrounds:** Easily composite the user over interactive particle backgrounds and other creative virtual environments.
- **AI Image Generation:** Integrations for further image processing using Hugging Face and OpenAI APIs.
- **Instant Sharing:** Generates on-the-fly QR codes (`qrcode.react`) for users to download their selfies directly to their mobile devices.
- **Modern UI:** Responsive, aesthetically pleasing design built using Tailwind CSS.

## 🚀 Tech Stack

- **Framework:** React 19, Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS (v4)
- **AI Models:** MediaPipe Selfie Segmentation, ONNX Runtime Web, Img.ly Background Removal
- **Utilities:** `browser-image-compression`, `uuid`

## 🛠️ Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd SelfieBooth
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Download required AI models:
   _(This step might run automatically via the `postinstall` script)_
   ```bash
   node download-models.mjs
   ```

## 💻 Development

Start the development server with Vite:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## 📦 Build for Production

To create a production-ready build:

```bash
npm run build
```

The output will be generated in the `dist` folder. To preview the production build locally:

```bash
npm run preview
```

## 🔧 Environment Setup

If you are using external APIs (such as Hugging Face for AI generative features or a backend API), please ensure to configure the appropriate base URLs or API keys in the `.env` file or within `src/utils/apiService.ts`.

Production deployment defaults to: `https://svsinfotech.in/zooimage/`

## 📄 License

This project is private and intended for internal use.
