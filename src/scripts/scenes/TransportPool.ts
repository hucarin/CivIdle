import { Container, Sprite, Texture } from "pixi.js";
import { ObjectPool } from "../utilities/ObjectPool";

export class TransportPool extends ObjectPool<Sprite> {
   _texture: Texture;
   _parent: Container;

   public static readonly DefaultAlpha = 0.5;

   constructor(texture: Texture, parent: Container) {
      super();
      console.assert(texture instanceof Texture, "Texture is not valid");
      this._texture = texture;
      this._parent = parent;
   }

   protected override create(): Sprite {
      const visual = this._parent.addChild(new Sprite(this._texture));
      visual.scale = { x: 0.15, y: 0.15 };
      visual.anchor.x = 1;
      visual.anchor.y = 0.5;
      return visual;
   }

   protected onAllocate(obj: Sprite): void {
      obj.alpha = TransportPool.DefaultAlpha;
   }

   protected onRelease(obj: Sprite): void {
      obj.alpha = 0;
   }
}