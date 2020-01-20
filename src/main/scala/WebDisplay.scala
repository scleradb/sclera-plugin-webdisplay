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

import java.awt.Desktop
import java.net.URI

import org.slf4j.{Logger, LoggerFactory}

import com.scleradb.interfaces.display.Display

/** Web display
  *
  * @param portOpt Port at which the http server is to be started (optional)
  */
class WebDisplay(portOpt: Option[Int]) extends Display {
    private val logger: Logger = LoggerFactory.getLogger(this.getClass.getName)

    private val server: HttpServer = HttpServer(portOpt)

    /**
     * Start the http server
     */
    override def start(): Unit = {
        server.start()
        println(s"HTTP server started at port ${server.port}")

        try openBrowser(server.url) catch { case (e: Throwable) => // ignore
            logger.warn(e.getMessage())
        } finally println(s"Please point your browser to ${server.url}")
    }

    /**
     * Submit message to browser
     * @param message Message to send
     */
    override def submit(message: String): Unit = server.send(message)

    /**
     * Stop the http server
     */
    override def stop(): Unit = {
        server.stop()
        println(s"HTTP server stopped at port ${server.port}")
    }

    private def openBrowser(url: String): Unit =
        if( Desktop.isDesktopSupported() )
            Desktop.getDesktop().browse(new URI(url))
}

object WebDisplay {
    def apply(portOpt: Option[Int]): WebDisplay = new WebDisplay(portOpt)
}
