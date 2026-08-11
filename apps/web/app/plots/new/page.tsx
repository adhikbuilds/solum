import Link from 'next/link';
import { Rail } from '@/components/Rail';
import { requireUser } from '@/lib/session';
import { listCommunities } from '@/lib/queries';
import { NewPlotForm } from '@/components/NewPlotForm';

export const dynamic = 'force-dynamic';

export default async function NewPlotPage() {
  const user = await requireUser();
  const communities = await listCommunities(user.organisationId);

  return (
    <>
      <Rail organisation={user.organisationName} workspace="Dubai land pipeline" user={user} />
      <main className="frame frame-narrow">
        <Link href="/" className="back">
          ← All plots
        </Link>
        <p className="eyebrow">New plot</p>
        <h1 className="page-h">Underwrite a site</h1>
        <p className="page-sub">
          Six inputs. Everything else starts from Dubai defaults and is editable afterwards — GFA is
          derived from plot area and FAR rather than taken on trust, because agent-supplied GFA is
          the input most likely to be wrong.
        </p>
        <NewPlotForm communities={communities} />
      </main>
    </>
  );
}
