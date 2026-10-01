"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCharacter } from "@/game/character";
import { CreateTwin } from "../create/create-twin";

/** The Create screen, filled in with the twin you have. No twin yet: create one instead. */
export function EditTwin() {
  const twin = useCharacter(); // undefined until read from this browser
  const router = useRouter();
  useEffect(() => {
    if (twin === null) router.replace("/create");
  }, [twin, router]);
  if (!twin) return <div className="flex-1" />;
  return <CreateTwin key={twin.createdAt || twin.avatarSeed} initial={twin} />;
}
