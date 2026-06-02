import { useEffect, useRef } from "react";

export default function useAlive() {
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);
  return aliveRef;
}
