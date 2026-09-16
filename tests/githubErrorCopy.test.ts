import { describe, expect, it } from "vitest";
import { GithubApiError, githubErrorCopy } from "@/lib/github/client";

describe("githubErrorCopy", () => {
  it("rewrites 401 Bad credentials into Settings-facing copy", () => {
    expect(githubErrorCopy(new GithubApiError(401, "Bad credentials"))).toMatch(
      /rejected the token/i
    );
    expect(githubErrorCopy(new GithubApiError(401, "Bad credentials"))).not.toMatch(
      /bad credentials/i
    );
  });

  it("keeps repo-not-found and permission copy distinct", () => {
    expect(githubErrorCopy(new GithubApiError(404, "Not Found"))).toMatch(/repo not found/i);
    expect(githubErrorCopy(new GithubApiError(403, "forbidden"))).toMatch(/forbade/i);
  });
});
