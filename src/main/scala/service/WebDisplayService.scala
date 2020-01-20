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

package com.scleradb.plugin.interfaces.webdisplay.service

import com.scleradb.interfaces.display.service.DisplayService

import com.scleradb.plugin.interfaces.webdisplay.WebDisplay

/** Web display service */
class WebDisplayService extends DisplayService {
    /** Identifier for the service */
    override val id: String = WebDisplayService.id

    /** Creates a WebDisplay object given the generic parameters
      * @param params Generic parameters
      */
    override def createDisplay(params: List[String]): WebDisplay =
        WebDisplay(params.headOption.flatMap(_.toIntOption))
}

/** Companion object. Stores the properties */
object WebDisplayService {
    /** Identifier for the service */
    val id: String = "WEBSERVER"
}
