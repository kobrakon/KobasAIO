import { IncomingMessage, ServerResponse } from "http";
import { DependencyContainer, injectable } from "tsyringe";
import { IHttpListener } from "../../../servers/http/IHttpListener";
import { HttpListenerMod } from "./HttpListenerMod";

@injectable()
export class HttpListenerModService 
{
    constructor(protected container: DependencyContainer) 
    {}
    
    public registerHttpListener(
        name: string,
        canHandleOverride: (sessionId: string, req: IncomingMessage) => boolean,
        handleOverride: (sessionId: string, req: IncomingMessage, resp: ServerResponse) => void
    ): void 
    {
        this.container.register<IHttpListener>(name, {useValue: new HttpListenerMod(canHandleOverride, handleOverride)});
        this.container.registerType("HttpListener", name);
    }
}