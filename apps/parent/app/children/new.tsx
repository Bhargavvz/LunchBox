import { Screen } from '@lunchbox/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ChildForm } from '../../src/components/ChildForm';
import { api } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/queryClient';

export default function NewChildScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen>
      <ChildForm
        error={error}
        onSubmit={async (values) => {
          try {
            const child = await api.children.create(values);
            await qc.invalidateQueries({ queryKey: ['children'] });
            router.replace(`/subscribe/${child.id}`);
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </Screen>
  );
}
