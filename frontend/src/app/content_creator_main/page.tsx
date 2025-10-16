import test1 from "../../../public/test1.png";
import post from "../../../public/post_generation.png";
import video from "../../../public/video.png";
import image from "../../../public/image.png";
import Link1 from "../../../public/Link.png";

import Image from "next/image";
import Link from "next/link";

export default function ProductPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-purple-900">
      <div className="container mx-auto px-4 pt-10 pb-20">
        {/* Hero Section */}
        <div className="flex flex-col items-center justify-center mb-10">
        <Image
          src={test1}
          width={100}        // slightly wider for better balance
          height={160}       // keep height proportional
          alt="AI Hero"
          className="rounded-xl border border-gray-200"
        />
      </div>
        {/* Header */}
        <header className="mb-12 text-center -mt-3">
          <h1 className="text-3xl md:text-4xl font-bold text-white">
            AI Agent Content Creator
          </h1>
          <p className="mt-3 text-lg text-gray-300 max-w-2xl mx-auto">
            Harness the power of AI to generate posts, videos, images, and social media insights — all in one creative hub.
          </p>
        </header>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 -mt-6">
          {/* Card 1: Post & Image Generation */}
          <Link href="/content_creator">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md p-4 transition-all transform hover:scale-105 hover:shadow-2xl hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
              <div className="relative h-40 rounded-xl overflow-hidden">
                <Image
                  src={post}
                  alt="Post & Image Generator"
                  layout="fill"
                  objectFit="cover"
                  className="rounded-xl"
                />
              </div>
              <h3 className="text-lg font-semibold mt-3 text-gray-900 dark:text-white">
                🖌 AI Post & Image Generator
              </h3>
              <p className="text-gray-300 mt-2 text-sm">
                Create eye-catching posts and stunning visuals instantly using advanced AI tools.
              </p>
              <p className="mt-3 text-center">
                <span className="text-blue-300 font-medium underline cursor-pointer hover:text-blue-200">
                  Try Now
                </span>
              </p>
            </div>
          </Link>

          {/* Card 2: Video Generation */}
          <Link href="/creator/ai-assistant">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md p-4 transition-all transform hover:scale-105 hover:shadow-2xl hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
              <div className="relative h-40 rounded-xl overflow-hidden">
                <Image
                  src={video}
                  alt="Video Generator"
                  layout="fill"
                  objectFit="cover"
                  className="rounded-xl"
                />
              </div>
              <h3 className="text-lg font-semibold mt-3 text-gray-900 dark:text-white">
                🎬 AI Video Creator
              </h3>
              <p className="text-gray-300 mt-2 text-sm">
                Transform scripts or ideas into full videos with AI-generated scenes and outlines.
              </p>
              <p className="mt-3 text-center">
                <span className="text-blue-300 font-medium underline cursor-pointer hover:text-blue-200">
                  Generate Video
                </span>
              </p>
            </div>
          </Link>

          {/* Card 3: Image Analysis -> dedicated page */}
          <Link href="/content_creator/image">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md p-4 transition-all transform hover:scale-105 hover:shadow-2xl hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
              <div className="relative h-40 rounded-xl overflow-hidden">
                <Image
                  src={image}
                  alt="Image Analyzer"
                  layout="fill"
                  objectFit="cover"
                  className="rounded-xl"
                />
              </div>
              <h3 className="text-lg font-semibold mt-3 text-gray-900 dark:text-white">
                🖼 AI Image Analyzer
              </h3>
              <p className="text-gray-300 mt-2 text-sm">
                Detect objects, text, emotions, and styles in images to optimize your content strategy.
              </p>
              <p className="mt-3 text-center">
                <span className="text-blue-300 font-medium underline cursor-pointer hover:text-blue-200">
                  Analyze Image
                </span>
              </p>
            </div>
          </Link>

          {/* Card 4: Social Media Q&A */}
          <Link href="/creator/creative-guidance">
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md p-4 transition-all transform hover:scale-105 hover:shadow-2xl hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer">
              <div className="relative h-40 rounded-xl overflow-hidden">
                <Image
                  src={Link1}
                  alt="Social Media Insights"
                  layout="fill"
                  objectFit="cover"
                  className="rounded-xl"
                />
              </div>
              <h3 className="text-lg font-semibold mt-3 text-gray-900 dark:text-white">
                📱 Social Media Q&A
              </h3>
              <p className="text-gray-300 mt-2 text-sm">
                Provide links or posts and get AI-powered suggestions, summaries, and engagement tips.
              </p>
              <p className="mt-3 text-center">
                <span className="text-blue-300 font-medium underline cursor-pointer hover:text-blue-200">
                  Get Insights
                </span>
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
