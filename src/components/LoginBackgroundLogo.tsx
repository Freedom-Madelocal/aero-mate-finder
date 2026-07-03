import { useEffect, useState } from "react";

export default function LoginBackgroundLogo() {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);

  useEffect(() => {
    let mounted = true;
    import("./LoginLogo3D").then((mod) => {
      if (mounted) {
        setComponent(() => mod.default);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!Component) return null;

  return <Component />;
}
