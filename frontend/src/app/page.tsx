import Image from "next/image";

export default function Home() {
  return (
    <div className="font-sans flex flex-col items-center justify-center min-h-screen p-8 bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-900 dark:to-gray-800 text-center">

      {/* Coming Soon */}
      <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900 dark:text-white">
        🚀 Social Media Manager AI agent
      </h1>
      <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
        We’re building something amazing. Stay tuned!
      </p>

      {/* Contributors */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
          👩‍💻 Contributors
        </h2>
        <ul className="mt-3 space-y-1 text-gray-700 dark:text-gray-300">
          <li>✨ Uvindu</li>
          <li>✨ Pulindu</li>
          <li>✨ Layara</li>
          <li>✨ Indhi</li>
        </ul>
      </div>

      {/* Footer */}
      <footer className="mt-16 text-sm text-gray-500 dark:text-gray-400">
        © {new Date().getFullYear()} Social Media Manager. All rights reserved.
      </footer>
    </div>
  );
}
