export default function Landing() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="h-screen flex flex-col items-center justify-center text-center">
        <h1 className="text-5xl font-bold">CyberGuard Pro</h1>
        <p className="mt-4 text-lg">Next-gen cyber defense for modern teams</p>
        <button className="mt-6 px-6 py-3 bg-purple-500 rounded-lg">Get Started</button>
      </section>

      {/* Features */}
      <section className="py-20 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        <div className="p-6 bg-gray-900 rounded-lg">Feature 1</div>
        <div className="p-6 bg-gray-900 rounded-lg">Feature 2</div>
        <div className="p-6 bg-gray-900 rounded-lg">Feature 3</div>
      </section>

      {/* Pricing */}
      <section className="py-20 bg-gray-950">
        <h2 className="text-3xl font-bold text-center mb-10">Pricing</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <div className="p-6 bg-gray-900 rounded-lg">Basic</div>
          <div className="p-6 bg-gray-900 rounded-lg">Pro</div>
          <div className="p-6 bg-gray-900 rounded-lg">Pro+</div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="py-20 max-w-6xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-6">Trusted by security leaders</h2>
        <div className="flex justify-center gap-10">Logos here</div>
      </section>

      {/* Footer */}
      <footer className="py-10 text-center text-gray-500">
        © {new Date().getFullYear()} CyberGuard Pro
      </footer>
    </div>
  );
}
