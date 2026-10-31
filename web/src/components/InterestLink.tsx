"use client";

import type { ProjectType } from "@/lib/contact";

export const PROJECT_TYPE_EVENT = "bellman:project-type";

// Jumps to the contact form and preselects the matching subject.
// Without JavaScript it still works as a plain anchor link.
export function InterestLink({
  type,
  className = "text-link",
  children,
}: {
  type: ProjectType;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href="#contato"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent<ProjectType>(PROJECT_TYPE_EVENT, { detail: type }))}
    >
      {children}
    </a>
  );
}
