// UNUSED
import { useParams } from 'react-router-dom';
import { useMemo } from 'react';

export function useClientPath() {
  const { clientUuid } = useParams();
  const uuid = clientUuid || '';

  const path = useMemo(() => {
    return (p) => `/c/${uuid}${p}`;
  }, [uuid]);

  return { uuid, path };
}
