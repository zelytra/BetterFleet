[![image](/webapp/src/assets/banners/banner.png)](https://betterfleet.fr/)
![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)
[![Tauri](https://img.shields.io/badge/tauri-%2324C8DB.svg?style=for-the-badge&logo=tauri&logoColor=%23FFFFFF)](https://tauri.app/)
[![Ko-Fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/zelytra)
[![Crowdin](https://img.shields.io/badge/Crowdin-2E3340.svg?style=for-the-badge&logo=Crowdin&logoColor=white)](https://translate.betterfleet.fr)

[![Translation](https://badges.crowdin.net/betterfleet/localized.svg)](https://translate.betterfleet.fr)

# BetterFleet

## About BetterFleet

BetterFleet is a free open source application designed to enhance the gaming experience in Sea Of Thieves by
facilitating the creation of alliances among players. With BetterFleet, you can organize game sessions and invite your
friends to join in a simple and intuitive manner.

:warning: BetterFleet is not an official application of Sea Of Thieves. It was developed by the community for
players looking to improve their gaming experience.
---

## Features

- **Automatic Session Management:** Facilitates joining the same server with your friends by providing real-time in-game status and server information.

- **Increase likelihood of finding a server:** Includes an automatic "Set sail" feature so that everyone clicks at the same time.

- **Self-Hosted Backend:** The open-source nature of the application allows users to host the backend, offering greater control over deployment and maintenance.

- **Statistics Tracking:** Provides statistical insights to help users assess their server-finding success rate.
---

## Comparison of Fleet Management Applications: BetterFleet vs. FleetCreator

| Feature                               | BetterFleet              | FleetCreator               |
|---------------------------------------|--------------------------|----------------------------|
| Speed*                                | ~5sec detection, fast UI | ~20 sec detection, slow UI |
| Ad free                               | :white_check_mark:       | :x:                        |
| Complete free access                  | :white_check_mark:       | :x:                        |
| UX friendly                           | :white_check_mark:       | :x:                        |
| Open source                           | :white_check_mark:       | :x:                        |
| IPv6 support                          | :white_check_mark:       | :x:                        |
| Automatic click between the same crew | :white_check_mark:       | :x:                        |
| Size of file                          | <20MB                    | >200MB                     |
| Enhanced detection algorithm**        | :white_check_mark:       | :warning:                  |
| No memory leak***                     | :white_check_mark:       | :warning:                  |

\* Comparison benchmark [spreadsheet](https://docs.google.com/spreadsheets/d/12ETC_1stmQ0MtDgxDIbpUkCQvMW4dVE_4f6FLz92RlA/edit?usp=sharing)\
\** Rare seems to be working on the [SDR](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay) implementation. In certains cases FleetCreator shows a "corrupted" status that we handle. More technical information [here](https://github.com/zelytra/BetterFleet/issues/364).\
\*** FleetCreator has been observed to consume 8GB of RAM after 10 hours of usage, indicating a possible memory leak.

---

## OS Compatibility

| Operating System | Compatible         |
|------------------|--------------------|
| Windows 11       | :white_check_mark: |
| Windows 10       | :white_check_mark: |
| macOS            | :x:                |
| Linux            | :x:                |

---

## Credits 👥

- **Development:** [Zelytra](https://zelytra.fr) & [dadodasyra](https://github.com/dadodasyra)
- **Design/Graphics:** [ZeTro](https://zetro.fr)
- **Translator/proofreader:** [Ichabodt](https://github.com/Ichabodt) (English & French) & [JumpFrostITA](https://github.com/JumpFrostITA) (Italian)
- **Contributor icons:** [Zamao](https://www.behance.net/Zamaostudio)

We thank everyone who contributes to making BetterFleet better every day. If you would like to contribute to the
project, feel free to fork the repository and submit your pull requests or you can also help translate our project with [our crowdin](https://translate.betterfleet.fr).

---

## License 📄

BetterFleet is distributed under the MIT license. See the [LICENSE](/LICENSE) file for more information.

---

## Support

If you have any questions or encounter problems with the app, please open an issue.

We hope you enjoy using BetterFleet as much as we enjoyed developing it!
