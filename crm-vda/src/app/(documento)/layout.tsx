import { redirect } from "next/navigation";
import { Fraunces, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { getCurrentProfile } from "@/lib/auth";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--f-display", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], variable: "--f-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--f-mono", display: "swap" });

export default async function DocumentoLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  return (
    <div className={`${fraunces.variable} ${instrument.variable} ${mono.variable}`}>
      {children}
    </div>
  );
}
