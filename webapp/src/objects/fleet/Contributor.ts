import contribFile from "@/assets/contributors/contributors.json";

export interface Contributor {
  developers: string[];
  translators: string[];
  designers: string[];
  alphaTesters: string[];
}

export enum ContributorType {
  DEVELOPER = "DEVELOPER",
  TRANSLATOR = "TRANSLATOR",
  DESIGNER = "DESIGNER",
  ALPHA_TESTER = "ALPHA_TESTER",
}

export class ContributorProvider {
  private static readonly contributors: Contributor =
    contribFile as Contributor;

  public static getPlayerContrib(username: string): ContributorType | null {
    const playerUsernameLower = username.toLowerCase();
    const roles: Record<ContributorType, keyof Contributor> = {
      [ContributorType.DEVELOPER]: "developers",
      [ContributorType.TRANSLATOR]: "translators",
      [ContributorType.DESIGNER]: "designers",
      [ContributorType.ALPHA_TESTER]: "alphaTesters",
    };

    for (const [type, group] of Object.entries(roles) as [
      ContributorType,
      keyof Contributor,
    ][]) {
      if (
        this.contributors[group].some(
          (name) => name.toLowerCase() === playerUsernameLower,
        )
      ) {
        return type;
      }
    }

    return null;
  }
}
