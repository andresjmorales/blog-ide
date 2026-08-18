import Link from "next/link";
import { isHostedDeployment } from "@/lib/hosted";
import { GithubMark } from "@/components/icons";

const REPO_URL = "https://github.com/andresjmorales/blog-ide";

/** Small footer link to the public repo. Hosting link only on hosted deploys. */
export function GitHubFooter() {
  const showHostingLink = isHostedDeployment();

  return (
    <footer className="mt-12 text-xs text-muted">
      MIT licensed · self-hostable
      {showHostingLink && (
        <>
          {" · "}
          <Link
            href="/hosting"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Hosting options
          </Link>
        </>
      )}
      {" · "}
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-foreground"
      >
        <GithubMark size={14} className="inline-block align-[-2px]" />
        GitHub
      </a>
    </footer>
  );
}
