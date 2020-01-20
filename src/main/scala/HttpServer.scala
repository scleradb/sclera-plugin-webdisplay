/**
* Sclera - Web Display
* Copyright 2012 - 2020 Sclera, Inc.
* 
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
* 
*     http://www.apache.org/licenses/LICENSE-2.0
* 
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

package com.scleradb.plugin.interfaces.webdisplay

import java.net.InetAddress

import scala.collection.concurrent.TrieMap

import io.javalin.Javalin
import io.javalin.websocket.WsContext

class HttpServer(val port: Int) {
    def url: String = {
        val localhost: InetAddress = InetAddress.getLocalHost
        val ipAddress: String = localhost.getHostAddress.trim
        s"http://$ipAddress:$port"
    }

    private val ctxSet: TrieMap[WsContext, Int] = new TrieMap()

    private val app: Javalin = Javalin.create { config =>
        config.addStaticFiles("/public")
        config.showJavalinBanner = false 
        config.asyncRequestTimeout = 0 
        config.wsFactoryConfig { wsFactory =>
            wsFactory.getPolicy.setIdleTimeout(0)
        }
    }

    def start(): Unit = {
        app.start(port)
        app.ws("/", { ws =>
            ws.onConnect { ctx => ctxSet.addOne(ctx -> ctxSet.size) }
            ws.onClose { ctx => ctxSet.remove(ctx) }
        })
    }

    def send(s: String): Unit =
        ctxSet.keys.filter(_.session.isOpen).foreach(_.send(s))

    def stop(): Unit = app.stop()
}

object HttpServer {
    val defaultPort: Int = 7070

    def apply(port: Int): HttpServer = new HttpServer(port)

    def apply(portOpt: Option[Int]): HttpServer =
        apply(portOpt getOrElse defaultPort)
}
