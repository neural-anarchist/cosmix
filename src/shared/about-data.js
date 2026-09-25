// Content for the About Us page. Everything marked PLACEHOLDER is
// meant to be replaced by editing this file — no other code changes.

// Rendered as HTML (see src/team.js), so the page-name references below
// carry real links to their pages. Section pages sit one directory deep,
// same as this page, so a sibling is reached with "../<id>/".
export const aboutParagraphs = [
  
  "The <a href=\"../observatory/\">Observatory</a> is the heart of Cosmix. Instead of grouping problems by topic, it brings them together by the shared physical models beneath them. Observe how a model evolves with its assumptions, conditions, and perhaps difficulty: that's how olympiad problems are built from first principles! You will find yourself gradually become more sensitive to the underlying physics of unfamiliar setups.",
  "For U.S. Physics Olympians, check out our F=ma/USAPhO mocks from the <a href=\"../trials/\">Trials</a> page (coming soon).",
  "Some interactive simulations are available on the <a href=\"../laboratory/\">Simulations</a> page, feel free to contact us if you hope to share a simulation setup you find interesting!",
  "The <a href=\"../frontier/\">Frontier</a> page is a collection of other recommended resources for PhO preparation.",
  "As knowledge and answers become easier and easier to obtain, we hope every reader can still find something uniquely valuable in their journey with physics."
];

// One entry per meeting. Add, remove, or reorder freely; the list
// scrolls once it outgrows its box.
export const clubSchedule = [
  { date: "October 1", time: "3:30-4:30 PM", title: "Introduction", details: "Introduction to the U.S. Physics Olympiad pathway, featuring club members’ experiences." },
  { date: "October 8", time: "3:30-4:30 PM", title: "Physics Insights Series #1", details: "Frames of reference." },
  { date: "October 15", time: "3:30-4:30 PM", title: "Physics Insights Series #2", details: "Small value approximations." },
  { date: "October 22", time: "3:30-4:30 PM", title: "Physics Insights Series #3", details: "'The grand calculus of the universe.'" },
  { date: "October 29", time: "3:30-4:30 PM", title: "Physics Insights Series #4", details: "Real life physics: the power of estimation." },
  { date: "November 5", time: "3:30-4:30 PM", title: "AMC10/12 A", details: "No Club" },
  { date: "November 12", time: "3:30-4:30 PM", title: "Kinematics", details: "Motion graphs, projectile motion, relative velocity, circular motion" },
  { date: "November 19", time: "3:30-4:30 PM", title: "Dynamics I", details: "Newton’s laws, free-body diagrams, friction, tension" },
  { date: "November 26", time: "3:30-4:30 PM", title: "Rotational Motion", details: "Torque, moment of inertia, angular momentum, rotational energy" },
  { date: "December 3", time: "3:30-4:30 PM", title: "Dynamics II", details: "Rigid-body motion, center of mass, rolling, coupled systems" },
  { date: "December 10", time: "3:30-4:30 PM", title: "Oscillations", details: "Simple harmonic motion, springs, pendulums, couples oscillators" },
  { date: "December 17", time: "3:30-4:30 PM", title: "Additional Topics in Mechanics", details: "Fluids, Mechanical Waves, Error Propagation" },
  { date: "December 24", time: "3:30-4:30 PM", title: "Christmas Break", details: "No club." },
  { date: "December 31", time: "3:30-4:30 PM", title: "Christmas Break", details: "No club." },
  { date: "January 7", time: "3:30-4:45 PM", title: "F=ma Mock #1", details: "" },
  { date: "January 14", time: "3:30-4:45 PM", title: "F=ma Mock #2", details: "" },
  { date: "January 21", time: "3:30-4:45 PM", title: "F=ma Mock #3", details: "" }
];

// `snapshot` is the image shown in the partner's photo window (a site
// screenshot or logo). Leave it null to show the placeholder.
export const partners = [
  {
    name: "Lex-Physics",
    url: "https://www.lexphysics.com/",
    snapshot: "../assets/images/partners/lexphysics.png",
    description: "Accessible AP Physics mentorship. By students, for students."
  }
];
