import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Monitor, Users, GraduationCap, Gavel, ShieldCheck, BookOpen, Heart, Megaphone, Trophy, Building2, UserRound, Library, Lightbulb, Handshake } from "lucide-react";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { COMMITTEES } from "@/lib/constants";
import heroBg from "@/assets/hero-bg.jpg";
import barCentre from "@/assets/nba-anaocha-bar-centre.jpeg";

// The generated Supabase types don't yet include the `people` table.
const db = supabase as any;

interface Person {
  id: string;
  name: string;
  position: string;
  category: "executive" | "committee" | "patron" | "leader_of_bar";
  committee: string | null;
  photo_url: string | null;
}

const PersonAvatar = ({ person, size }: { person: Person; size: string }) => (
  <div className={`${size} hover-zoom mx-auto rounded-full overflow-hidden border-4 border-muted bg-muted flex items-center justify-center group-hover:scale-105 group-hover:border-primary/40`}>
    {person.photo_url ? (
      <img src={person.photo_url} alt={person.name} className="h-full w-full object-cover" loading="lazy" />
    ) : (
      <UserRound className="h-1/2 w-1/2 text-muted-foreground" />
    )}
  </div>
);

// Icon per committee, keyed by the shared COMMITTEES name so the list itself
// stays defined in one place (src/lib/constants.ts).
const committeeIcons: Record<string, JSX.Element> = {
  "Human Rights": <ShieldCheck className="h-5 w-5" />,
  "ICT & Tech": <Monitor className="h-5 w-5" />,
  "Women Forum": <Users className="h-5 w-5" />,
  "Young Lawyers": <GraduationCap className="h-5 w-5" />,
  "Disciplinary": <Gavel className="h-5 w-5" />,
  "Journal": <BookOpen className="h-5 w-5" />,
  "Welfare": <Heart className="h-5 w-5" />,
  "Publicity": <Megaphone className="h-5 w-5" />,
  "Sports": <Trophy className="h-5 w-5" />,
  "Bar Centre": <Building2 className="h-5 w-5" />,
  "Continuing Legal Education": <Library className="h-5 w-5" />,
  "Advisory": <Lightbulb className="h-5 w-5" />,
  "Bar/Bench Relationship": <Handshake className="h-5 w-5" />,
};

const Index = () => {
  const { user, loading } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [openCommittee, setOpenCommittee] = useState<string | null>(null);

  useEffect(() => {
    db.from("people")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data }: { data: Person[] | null }) => setPeople(data || []));
  }, []);

  const patron = people.find((p) => p.category === "patron");
  const leaderOfBar = people.find((p) => p.category === "leader_of_bar");
  const executives = people.filter((p) => p.category === "executive");
  const membersFor = (committee: string) =>
    people.filter((p) => p.category === "committee" && p.committee === committee);

  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Hero: full bleed image */}
      <section className="relative overflow-hidden min-h-[560px] md:min-h-[640px] flex items-center">
        <img
          src={heroBg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="relative container py-20 md:py-32">
          <p className="text-white/60 text-xs font-bold tracking-[0.3em] uppercase mb-5">
            Institutional Excellence
          </p>
          <h1 className="font-heading text-4xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.08] mb-4 max-w-3xl">
            Nigerian Bar Association
            <br />
            <span className="italic font-heading text-white/90">Anaocha Branch</span>
          </h1>
          <p className="text-white/65 italic text-base md:text-lg max-w-xl mb-10 leading-relaxed">
            Promoting the Rule of Law through unwavering professional integrity and community service.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/signin"
              className="group inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold px-6 py-3 rounded-md hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 ease-out text-sm"
            >
              Access Portal <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <a
              href="#about"
              className="inline-flex items-center justify-center gap-2 border border-white/30 text-white font-semibold px-6 py-3 rounded-md hover:bg-white/10 hover:border-white/70 hover:-translate-y-0.5 transition-all duration-300 ease-out text-sm"
            >
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="py-16 md:py-24">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Image with overlapping stat card */}
            <div className="relative">
              <div className="w-full aspect-[4/3] rounded-xl shadow-xl overflow-hidden">
                <img
                  src={barCentre}
                  alt="Chief Charles E. N. Obegolu Bar Centre, NBA Anaocha Branch"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="absolute bottom-3 left-3 md:bottom-6 md:left-6 bg-background border border-border rounded-xl shadow-lg p-3 md:p-5 max-w-[120px] md:max-w-[180px]">
                <p className="font-heading text-xl md:text-3xl font-bold text-primary">2014</p>
                <p className="text-[11px] md:text-xs font-bold tracking-widest uppercase text-muted-foreground mt-0.5 md:mt-1">Founded in Anaocha</p>
                <p className="hidden md:block text-xs text-muted-foreground mt-2 leading-snug">Established with a vision for legal excellence and professional camaraderie.</p>
              </div>
            </div>

            {/* Text */}
            <div>
              <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-6 leading-tight">
                The Family Bar
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed text-sm md:text-base">
                <p>
                  The NBA Anaocha Branch, fondly known as "The Family Bar," stands as a pillar of professional development and legal advocacy in Anambra State. Since our founding in <span className="text-foreground font-medium">2014</span>, we have cultivated an environment where legal practitioners thrive through mutual support and intellectual rigor.
                </p>
                <p>
                  Our commitment extends beyond the courtroom: we are dedicated to the preservation of the rule of law and the advancement of justice for all members of the Anaocha community.
                </p>
              </div>
              <div className="flex gap-6 mt-8">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Integrity</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-bold tracking-widest uppercase text-muted-foreground">Unity</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Grand Patron / Founder & Leader of the Bar */}
      {(patron || leaderOfBar) && (
        <section className="py-12 md:py-16 bg-muted/30 border-y border-border">
          <div className="container">
            <div className={`grid grid-cols-1 gap-12 max-w-5xl mx-auto ${patron && leaderOfBar ? "md:grid-cols-2 md:gap-8" : ""}`}>
              {patron && (
                <div className="flex flex-col items-center gap-6 text-center">
                  <div className="group shrink-0">
                    <PersonAvatar person={patron} size="h-48 w-48 md:h-56 md:w-56" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent mb-2">Grand Patron &amp; Founder</p>
                    <h2 className="font-heading text-2xl md:text-3xl font-bold text-foreground">{patron.name}</h2>
                    <p className="text-sm text-muted-foreground mt-4 leading-relaxed max-w-md mx-auto">
                      The visionary whose dedication founded the NBA Anaocha Branch and whose legacy continues to guide the Family Bar.
                    </p>
                  </div>
                </div>
              )}
              {leaderOfBar && (
                <div className="flex flex-col items-center gap-6 text-center">
                  <div className="group shrink-0">
                    <PersonAvatar person={leaderOfBar} size="h-48 w-48 md:h-56 md:w-56" />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-[0.25em] uppercase text-accent mb-2">Leader of the Bar &middot; 1st SAN of the Branch</p>
                    <h2 className="font-heading text-2xl md:text-3xl font-bold text-foreground">{leaderOfBar.name}</h2>
                    <p className="text-sm text-muted-foreground mt-4 leading-relaxed max-w-md mx-auto">
                      The first Senior Advocate of Nigeria of the branch, leading the Bar in Anaocha with distinction at the Inner Bar.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Branch Executives */}
      {executives.length > 0 && (
        <section id="executives" className="py-16 md:py-20 border-t border-border overflow-hidden">
          <div className="container">
            <div className="text-center mb-12">
              <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">Branch Executives</h2>
              <p className="text-xs font-bold tracking-[0.25em] uppercase text-muted-foreground">Meet the Leadership of the Family Bar</p>
            </div>
          </div>
          {executives.length > 5 ? (
            // Enough to overflow: auto-scrolling marquee (list duplicated for a seamless loop).
            <div className="relative w-full overflow-hidden group">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-16 z-10 bg-gradient-to-r from-background to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-16 z-10 bg-gradient-to-l from-background to-transparent" />
              <div className="flex w-max gap-8 animate-marquee group-hover:[animation-play-state:paused] px-4">
                {[...executives, ...executives].map((p, i) => (
                  <div key={`${p.id}-${i}`} className="group shrink-0 w-52 text-center">
                    <PersonAvatar person={p} size="h-48 w-48" />
                    <p className="font-heading font-semibold text-sm text-foreground mt-4 transition-colors group-hover:text-primary">{p.name}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{p.position}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Just a few: show them static and centered (no duplication, no movement).
            <div className="container">
              <div className="flex flex-wrap justify-center gap-x-12 gap-y-10">
                {executives.map((p) => (
                  <div key={p.id} className="group w-52 text-center">
                    <PersonAvatar person={p} size="h-48 w-48" />
                    <p className="font-heading font-semibold text-sm text-foreground mt-4 transition-colors group-hover:text-primary">{p.name}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{p.position}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Committees */}
      <section id="committees" className="py-16 md:py-20 bg-muted/30 border-y border-border">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-2">Branch Committees</h2>
            <p className="text-xs font-bold tracking-[0.25em] uppercase text-muted-foreground">Specialized Divisions Driving Our Mission</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {COMMITTEES.map((c) => {
              const count = membersFor(c.name).length;
              return (
                <button
                  type="button"
                  key={c.name}
                  onClick={() => setOpenCommittee(c.name)}
                  className="group text-left rounded-xl p-5 border bg-background border-border hover:border-primary/30 hover:shadow-md hover:-translate-y-1 transition-all duration-300 ease-out"
                >
                  <div className="mb-3 text-muted-foreground transition-colors duration-300 group-hover:text-primary">{committeeIcons[c.name]}</div>
                  <p className="font-heading font-semibold text-sm mb-1.5 text-foreground">{c.name}</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
                  <p className="mt-3 text-xs font-semibold text-primary inline-flex items-center gap-1">
                    {count > 0 ? `View ${count} member${count > 1 ? "s" : ""}` : "View committee"}
                    <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Committee members dialog */}
      <Dialog open={!!openCommittee} onOpenChange={(open) => !open && setOpenCommittee(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{openCommittee} Committee</DialogTitle>
          </DialogHeader>
          {openCommittee && (() => {
            const members = membersFor(openCommittee);
            const committee = COMMITTEES.find((c) => c.name === openCommittee);
            if (members.length === 0) {
              return (
                <div className="py-8 text-center space-y-2">
                  <p className="text-sm text-muted-foreground">{committee?.desc}</p>
                  <p className="text-sm text-muted-foreground">Committee members will be announced soon.</p>
                </div>
              );
            }
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 py-2">
                {members.map((m) => (
                  <div key={m.id} className="group text-center">
                    <PersonAvatar person={m} size="h-28 w-28" />
                    <p className="font-heading font-semibold text-sm text-foreground mt-3 transition-colors group-hover:text-primary">{m.name}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{m.position}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default Index;
