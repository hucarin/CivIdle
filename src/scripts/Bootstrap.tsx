import { Assets } from "@pixi/assets";
import { Application, BitmapFont, Spritesheet, Ticker } from "pixi.js";
import altasDef from "../images/textures.json";
import { Building } from "./definitions/BuildingDefinitions";
import { City } from "./definitions/CityDefinitions";
import {
   getGameState,
   initializeSavedGame,
   initializeSingletons,
   ISpecialBuildings,
   loadGame,
   notifyGameStateUpdate,
   saveGame,
   Singleton,
   syncUITheme,
} from "./Global";
import { getBuildingTexture } from "./logic/BuildingLogic";
import { calculateTierAndPrice, Config } from "./logic/Constants";
import { GameState, initializeGameState } from "./logic/GameState";
import { ITileData } from "./logic/Tile";
import { shouldTick, tickEveryFrame, tickEverySecond } from "./logic/Update";
import { fonts, MainBundleAssets } from "./main";
import { RouteChangeEvent } from "./Route";
import { connectWebSocket } from "./rpc/RPCClient";
import { isSteam, SteamClient } from "./rpc/SteamClient";
import { Grid } from "./scenes/Grid";
import { WorldScene } from "./scenes/WorldScene";
import { ErrorPage } from "./ui/ErrorPage";
import { forEach } from "./utilities/Helper";
import Actions from "./utilities/pixi-actions/Actions";
import { SceneManager, Textures } from "./utilities/SceneManager";
import { TypedEvent } from "./utilities/TypedEvent";
import { Fonts } from "./visuals/Fonts";

export async function loadBundle() {
   fonts.forEach((f) => document.fonts.add(f));
   const result = await Promise.all([Assets.loadBundle(["main"])].concat(fonts.map((f) => f.load())));
   const { main }: { main: MainBundleAssets } = result[0];

   fonts.forEach((f) =>
      BitmapFont.from(
         f.family,
         { fill: "#ffffff", fontSize: 64, fontFamily: f.family },
         { chars: BitmapFont.ASCII, resolution: 2 }
      )
   );
   BitmapFont.from(
      Fonts.Marcellus,
      { fill: "#ffffff", fontSize: 64, fontFamily: Fonts.Marcellus },
      { chars: BitmapFont.ASCII, padding: 2, resolution: 2 }
   );
   const textures = await new Spritesheet(main.atlas, altasDef as any).parse();
   return { main, textures };
}

export async function startGame(
   app: Application,
   resources: MainBundleAssets,
   textures: Textures,
   routeChanged: TypedEvent<RouteChangeEvent>
) {
   // ========== Load game data ==========
   let isNewPlayer = false;
   const data = await loadGame();
   if (data) {
      initializeSavedGame(data);
   } else {
      isNewPlayer = true;
   }

   // ========== Game data is loaded ==========

   const gameState = getGameState();

   verifyBuildingTextures(textures, gameState.city);

   const size = Config.City[gameState.city].size;
   const grid = new Grid(size, size, 64);

   if (isNewPlayer) {
      initializeGameState(gameState, grid);
   }

   // ========== Game state is initialized ==========

   syncUITheme();
   calculateTierAndPrice(gameState);
   initializeSingletons({
      sceneManager: new SceneManager({ app, assets: resources, textures, gameState }),
      buildings: findSpecialBuildings(gameState) as ISpecialBuildings,
      grid,
      routeTo: (component, params) => routeChanged.emit({ component, params }),
   });

   // ========== Connect to server ==========
   await connectWebSocket();

   // We tick first before loading scene, making sure city-specific overrides are applied!
   tickEverySecond(gameState);

   // if (import.meta.env.DEV) {
   // createRoot(document.getElementById("debug-ui")!).render(<PlayerTradeComponent />);
   // }

   // Singleton().sceneManager.loadScene(PlayerMapScene);
   // Singleton().sceneManager.loadScene(FlowGraphScene);
   Singleton().sceneManager.loadScene(WorldScene);
   // Singleton().sceneManager.loadScene(TechTreeScene);

   notifyGameStateUpdate();

   startTicker(app.ticker, gameState);

   await checkSteamBranch();
}

async function checkSteamBranch() {
   if (!isSteam()) {
      return;
   }
   const beta = await SteamClient.getBetaName();
   if (beta !== "beta") {
      Singleton().routeTo(ErrorPage, {
         content: (
            <>
               <div className="title">Please Switch To Beta Branch On Steam</div>
               <div>
                  You are not currently on beta branch. Please close the game, go to Steam, right click CivIdle -&gt;
                  Properties -&gt; Betas and select "beta" in the dropdown menu. After Steam has finish downloading,
                  start the game again. If this error persists, please report the bug on Discord.
               </div>
            </>
         ),
      });
   }
}

function startTicker(ticker: Ticker, gameState: GameState) {
   ticker.add(() => {
      if (!shouldTick()) {
         return;
      }
      const dt = ticker.elapsedMS / 1000;
      Actions.tick(dt);
      tickEveryFrame(gameState, dt);
   });

   setInterval(() => {
      tickEverySecond(gameState);
      if (gameState.tick % 5 == 0) {
         saveGame();
      }
   }, 1000);
}

function findSpecialBuildings(gameState: GameState): Partial<Record<Building, ITileData>> {
   const buildings: Partial<Record<Building, ITileData>> = {};
   forEach(gameState.tiles, (_, tile) => {
      if (tile.building?.type === "Headquarter") {
         console.assert(
            buildings.Headquarter === undefined,
            "There should be only one Headquarter. One =",
            buildings.Headquarter,
            "Another = ",
            tile
         );
         buildings.Headquarter = tile;
      }
   });
   return buildings;
}

function verifyBuildingTextures(textures: Textures, city: City) {
   forEach(Config.Building, (b) => {
      if (!getBuildingTexture(b, textures, city)) {
         console.warn(`Cannot find textures for building ${b}`);
      }
   });
}
