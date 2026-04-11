export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Left — form */}
      <div className="flex w-full flex-col items-center justify-center px-4 lg:w-1/2">
        <div className="w-full max-w-md">{children}</div>
      </div>
      {/* Right — branding panel */}
      <div className="hidden bg-primary-600 lg:flex lg:w-1/2 lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <h1 className="text-4xl font-bold text-white">ForgeMsg</h1>
        <p className="mt-4 max-w-sm text-center text-lg text-primary-100">
          Unified omnichannel messaging. Email, SMS, WhatsApp, push &amp; voice — one platform.
        </p>
      </div>
    </div>
  );
}
