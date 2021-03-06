const colyseus = require('colyseus');

//Include room state
const MyRoomState = require('./schema/MyRoomState').MyRoomState;
//Include Player class
const Player = require('./schema/Player').Player
const Territoire = require('./schema/Territoire').Territoire
var GameStarted = false
var state = "placementInitial"

exports.MyRoom = class MyRoom extends colyseus.Room {

	maxClients = 6; //6 dans les règles originales, 9 pour les bg
  	onCreate (options) {
		// - - - - - - - - - - - - - - - - - - - - - - - - -//
		// - - - - - - - - - - -Room State - - - - - - - - -//

		this.setState(new MyRoomState());

		// - - - - - - - - - - - - - - - - - - - - - - - - -//
		
		// - - - - - - - - - - - - - - - - - - - - - - - - -//
		
//========================= MESSAGES INTERPRETES PAR LE SERVEUR =========================//	
			
		//Gestion du changement de pseudo
		this.onMessage("author", (client, message) => {
			const player = this.state.players.get(client.sessionId);
			player.nom = message;
			this.broadcast("listUserConnected", this.state.players) //ordonne au client d'actualiser la liste des joueurs connectés
		});

		//Gestion de la discussion publique		 		
    	this.onMessage("message", (client, message) => {
			const player = this.state.players.get(client.sessionId);
			// 3 paramètre pour message : 1er : le message; 2eme : le pseudo, 3eme : la couleur
			this.broadcast("messages", [message, player.nom, player.color]) //ordonne au client d'afficher le message dans la chatbox
		});
		

		//Gestion de la réaction du serveur aux clicks sur la carte en fonction de la phase de jeu et du joueur actif	
			
		var deplacementencours = false 
		var deplacementdepuis = 0 //variable qui stockera le territoire depuis lequel le déplacement est en train de s'effectuer

		var attaqueencours = false
		var territoireattaque = 0 //variable qui stockera le territoire depuis lequel l'attaque est en train de s'effectuer

		this.onMessage("territoireClicked",(client, message)=>{
			const player = this.state.players.get(client.sessionId);
			var territoire = new Territoire("0","0","0","0");
			territoire = this.state.carte.get(message)
			client.send("activeterritoireclicked",[territoire.nom,this.state.carte])
			if (IdActif != client.sessionId) {return} //seul le joueur actif peut interragir avec la carte
			
			if (state=="placementInitial" ){				
				if(territoire.proprietaire == client.sessionId && player.stock!=0){ //incremente l'armée du territoire et décrémente le stock du joueur
					territoire.army++ 
					player.stock--
					PasserLaMain() //passe au joueur suivant
//					if(!tousLesJoueursOntPlace(this.state.players) && this.state.players.get(IdActif).stock==0){PasserLaMain()}
				}
				if (tousLesJoueursOntPlace(this.state.players)){ //si tout le monde a placé ses pions de départ, passage à la phase renfort
					state="renforts"
					this.state.players.get(IdActif).stock=calculRenforts(IdActif,this.state.carte) //attribue au joueur actif ses renforts à placer
				}
				else if (player.stock == 0){PasserLaMain()} //cas où le joueur n'as plus rien à placer mais d'auters joueurs si
				this.broadcast("activePlayer",[state, this.state.players.get(IdActif).nom, this.state.players.get(IdActif).color]) //ordonne au client d'afficher qui est le joueur actif
				this.broadcast("carteChange", [this.state.players,this.state.carte])	//met à jour la carte	
//				if(!tousLesJoueursOntPlace(this.state.players) && player.stock==0){PasserLaMain()}						
			}
			
			
			else if(state=="renforts"){ 
				if(territoire.proprietaire == client.sessionId && player.stock!=0){ //incremente l'armée du territoire et décrémente le stock du joueur
					territoire.army++
					player.stock--
					this.broadcast("carteChange", [this.state.players,this.state.carte])
				}
				if(player.stock==0){ //si le joueur a placé tous ses pions, lui demande si il veut attaquer
					state="inconnu" //empêche le client de cliquer avant qu'il n'ait décidé si il attaque ou non
					client.send("Attaque_Confirmer",[""])
				}
			}
			
			//gestion des attaques
			else if(state=="attaque"){	
				if(territoire.proprietaire == client.sessionId && !attaqueencours && Deplacement_ennemiLimitrophe(territoire)){ //determine le territoire attaquant
					territoireattaque = territoire
					attaqueencours=true
					this.broadcast("Attaque_Rafraichir",[territoireattaque.nom, territoire.army.toString(), "", ""]) //ordonne au client d'afficher l'attaquant et le défenseur
				}
				else if(territoire.proprietaire != client.sessionId && attaqueencours){ //determine le territoire défenseur 
					var territoiredefense = territoire
					var combattre = Combat_attaquePossible(territoireattaque,territoiredefense) // boolean qui indique si l'attaque est possible
					if(!combattre){
						attaqueencours=false
					}
					else{
						this.broadcast("Attaque_Rafraichir",[territoireattaque.nom, territoireattaque.army.toString(), territoiredefense.nom, territoiredefense.army.toString()])
						client.send("Attaque_Combat",[territoireattaque.nom, territoireattaque.army.toString(), territoiredefense.nom, territoiredefense.army.toString()])
						state="inconnu"
					}
				}
			}

			//permet de réattaquer les territoires adjacents à celui qui vient d'être conquis
			else if(state=="reattaque"){
				if(territoire.proprietaire != client.sessionId && attaqueencours){
					var territoiredefense = territoire
					var combattre = Combat_attaquePossible(territoireattaque,territoiredefense) 
					if(!combattre){
						attaqueencours=true
					}
					else{
						this.broadcast("Attaque_Rafraichir",[territoireattaque.nom, territoireattaque.army.toString(), territoiredefense.nom, territoiredefense.army.toString()])
						client.send("Reattaque_Combat",[territoireattaque.nom, territoireattaque.army.toString(), territoiredefense.nom, territoiredefense.army.toString()])
						state="inconnu"
					}
				}
			}
			
			//permet de faire un déplacement 
			else if(state=="deplacement"){
				if(territoire.proprietaire == client.sessionId && deplacementencours){ //determine le territoire de départ
					var deplacemementvers = territoire
					var deplacementStatus = IsDeplacement_possible(deplacementdepuis,deplacemementvers)
					client.send("CombienDeplacer",[deplacementdepuis,deplacemementvers,deplacementStatus[0],deplacementStatus[1]])			
				}
				else if(territoire.proprietaire == client.sessionId && !deplacementencours && Deplacement_voisinLimitrophe(territoire)){ //determine le territoire de destination
					deplacementdepuis = territoire
					deplacementencours=true
				}
			}
		})

		//Gestion des déplacements ==> passe en mode renfort si le deplacement est effectué
		this.onMessage("Nbdeplacements",(client, message)=>{
			if(message!="impossible"){
			var territoiredepuis = this.state.carte.get(message[0].nom)
			var territoirevers = this.state.carte.get(message[1].nom)
			territoiredepuis.army = message[0].army - message[2]
			territoirevers.army = message[1].army + message[2]
			this.state.carte.set(territoiredepuis.nom,territoiredepuis)
			this.state.carte.set(territoirevers.nom,territoirevers)
			PasserLaMain()
			this.state.players.get(IdActif).stock=calculRenforts(IdActif,this.state.carte)
			this.broadcast("carteChange", [this.state.players,this.state.carte])
			state="renforts"
			this.broadcast("activePlayer",[state, this.state.players.get(IdActif).nom, this.state.players.get(IdActif).color])
			}
			deplacementencours=false
		})



		//Gestion de l'attaque
		this.onMessage("Attaque_Confirmation",(client, message)=>{
			if (message=="1") {
				state="attaque"
			}
			else {
				state="deplacement"
				if (! Deplacement_joueurpossedeterritoirenonisole(IdActif,this.state.carte)) { //Gestion du cas où le joueur ne peut pas faire de déplacement
					PasserLaMain()
					state="renforts"
					this.state.players.get(IdActif).stock=calculRenforts(IdActif,this.state.carte)
					this.broadcast("carteChange", [this.state.players,this.state.carte])
					this.broadcast("activePlayer",[state, this.state.players.get(IdActif).nom, this.state.players.get(IdActif).color])
				}
				else {
					client.send("Deplacement_possible",[""])
				}
			}
			this.broadcast("activePlayer",[state, this.state.players.get(IdActif).nom, this.state.players.get(IdActif).color])
		})
		

// Reception du boolean indiquant si le joueur souhaite se déplacer
		this.onMessage("Deplacement_Confirmation",(client, message)=>{ 
			if (message[0] == false){
				PasserLaMain()
				state="renforts"
				this.state.players.get(IdActif).stock=calculRenforts(IdActif,this.state.carte)
				this.broadcast("carteChange", [this.state.players,this.state.carte])
				this.broadcast("activePlayer",[state, this.state.players.get(IdActif).nom, this.state.players.get(IdActif).color])
			}
		})


// Met à jour la carte après le combat
		this.onMessage("Attaque_CombatTermine",(client, message)=>{
			var attaquantPaysNom=message[0]
			var attaquantArmees=parseInt(message[1],10)
			var defenseurPaysNom=message[2]
			var defenseurArmees=parseInt(message[3],10)
			var transfert=message[4]
			if (defenseurArmees == 0) {
				var attaquantPays=this.state.carte.get(attaquantPaysNom)
				var defenseurPays=this.state.carte.get(defenseurPaysNom)
				attaquantPays.army=attaquantArmees-transfert
				defenseurPays.army=transfert
				defenseurPays.proprietaire=attaquantPays.proprietaire
				territoireattaque=defenseurPays
				if (territoireattaque.army > 1 && Deplacement_ennemiLimitrophe(territoireattaque)) {
					this.broadcast("Attaque_Rafraichir",[territoireattaque.nom, territoireattaque.army.toString(), "", ""])
					state="reattaque"
				}
				else{
					state="deplacement"
					attaqueencours=false
				}
			}
			else {
				var attaquantPays=this.state.carte.get(attaquantPaysNom)
				attaquantPays.army=attaquantArmees
				state="deplacement"
				attaqueencours=false
			}
			if (state=="deplacement") { //cas où l'attaquant a perdu
				if (! Deplacement_joueurpossedeterritoirenonisole(IdActif,this.state.carte)) {
					PasserLaMain()
					state="renforts"
					this.state.players.get(IdActif).stock=calculRenforts(IdActif,this.state.carte)
				}
				else {
					client.send("Deplacement_possible",[""])
				}
			}
			this.broadcast("carteChange", [this.state.players,this.state.carte])
			this.broadcast("activePlayer",[state, this.state.players.get(IdActif).nom, this.state.players.get(IdActif).color])
		})
					 


		
		//Initialise la hashMap des territoires
		this.onMessage("carte",(client, message)=>{
			for(var i = 0; i<42; i++){
				this.state.carte.set(message[i]['name'],new Territoire(message[i]['name'],message[i]['continent'],message[i]['proprietaire']))
				}
			for(var i = 0; i<42; i++){
				var L =[]
				getVoisins(message[i]['name']).forEach((name)=>{
					L.push(this.state.carte.get(name))
				})
				this.state.carte.get(message[i]['name']).voisins=L
			}
		})


		
		//LANCEMENT DE LA PARTIE !!! :D (la joie et le bonne humeur se répandent grâce à nous <3)
		var nbplayersstarted = 0
		this.onMessage("GetStarted",(client)=>{
			GameStarted = true
			this.broadcast("GameHasStarted")
			Order.forEach((Id) => {	//attribue de façon aléatoire et équitable les territoires	et les pions de départ									
				const player = this.state.players.get(Id)
				player.stock = originalStock(this.state.players.size)			
				var nbplayers = this.state.players.size - nbplayersstarted
				var nbterritoireslibres = 0
				this.state.carte.forEach((value) =>{
					if(value.proprietaire == "none"){
						nbterritoireslibres++
					}
				})
				var compteur = Math.floor(nbterritoireslibres/nbplayers)
				var i = 0
				while(i<compteur){
					var k = -1
					var a = Math.floor(Math.random() * 42)
					this.state.carte.forEach((value) =>{
					k++
					if(k == a && value.proprietaire == "none"){
						value.proprietaire=Id
						player.stock--
						i++
					}
				})			
				}
				nbplayersstarted++
				})
			this.broadcast("carteChange", [this.state.players,this.state.carte])
			if(nbplayersstarted==this.state.players.size){
				OrderInitialize()
				this.broadcast("activePlayer",[state, this.state.players.get(IdActif).nom, this.state.players.get(IdActif).color])
			}
		})



		//Gestion de la capitulation d'un joueur
		this.onMessage("Abandon",(client)=>{
			client.send("Abandon_Confirmer",[""])
		})
		this.onMessage("Abandon_Confirmation",(client, message)=>{
			if (message == "1") {
				const player = this.state.players.get(client.sessionId)
				this.broadcast("messages", [('('+client.sessionId+") : vient d'abandonner, quel nul !"),player.nom,player.color]);
				Order.splice(Order.indexOf(client.sessionId),1)
				if(IdActif==client.sessionId){
					PasserLaMain()
					if(state != "placementInitial"){
						state = "renforts"
						this.state.players.get(IdActif).stock=calculRenforts(IdActif,this.state.carte)
						}
					this.broadcast("carteChange", [this.state.players,this.state.carte])
				}
				if(Order.length==1){ //s'il ne reste qu'un joueur, il a gagné
					var gagnant = this.state.players.get(IdActif)
					this.broadcast("messages", [('('+IdActif+') : vient de conquérir le monde, quel boss !'),gagnant.nom,gagnant.color]);
					this.broadcast("VICTOIRE", gagnant.color)
					}
			}
		})
	}	


	//s'active quand un joueur se connecte au serveur
	onJoin (client, options) {
		if(GameStarted == true){throw new Error("Partie Complète")}
		else{
		this.state.players.set(client.sessionId, new Player());
		if(this.state.carteInit==false)
		{
			this.broadcast("CarteInit",this.state.carte);
			this.state.carteInit = true;
		}
		this.state.players.get(client.sessionId).color = changeColorFunction()
		// Affichage liste users présent
		this.broadcast("listUserConnected", this.state.players);
		const player = this.state.players.get(client.sessionId);
		Order.push(client.sessionId)
		this.broadcast("messages", [('('+client.sessionId+') : vient d\'arriver !'),player.nom,player.color]);
		}
	}
	
	//S'active quand un joueur se déconnecte (on considère qu'il capitule)
	onLeave (client, consented) {
		const player = this.state.players.get(client.sessionId)
		this.broadcast("messages", [('('+client.sessionId+') : vient malheureusement de partir !'),player.nom,player.color]);
		this.state.players.delete(client.sessionId)
		Order.splice(Order.indexOf(client.sessionId),1)
		if(IdActif==client.sessionId){
				PasserLaMain()
				if(state != "placementInitial"){
					state = "renforts"
					this.state.players.get(IdActif).stock=calculRenforts(IdActif,this.state.carte)
					}
				this.broadcast("carteChange", [this.state.players,this.state.carte])
			}
		if(Order.length==1){ //ceci ne s'active que si il n'y a plus qu'un joueur
			var gagnant = this.state.players.get(Idactif)
			this.broadcast("messages", [('('+IdActif+') : vient de conquérir le monde, quel boss !'),gagnant.nom,gagnant.color]);
			this.broadcast("VICTOIRE", gagnant.color)
			}
		//On actualise la liste des joueurs lorsqu'un joueur se déconnecte
		this.broadcast("listUserConnected", this.state.players);
	}

	onDispose() {
	}

}

//=======================================================================================//	



//Gestion de l'ordre des joueurs
var Order = []
var IdActif = "none"
function OrderInitialize(){
	Order.sort() //randomisation puisque les indentifiants colyseus sont donnés aléatoirement
	IdActif = Order[0]
}
function PasserLaMain(){
	var IndexActif = Order.indexOf(IdActif)
	if(IndexActif==Order.length-1){
		IdActif=Order[0]
	}
	else{
		IdActif=Order[IndexActif+1]
	}
}

//Indique si tous les joueurs ont placé leur pions
function tousLesJoueursOntPlace(players){
	for(var i = 0; i<Order.length; i++){
		if(players.get(Order[i]).stock!=0){return false}
	}
	return true
}

//Gestion du cas où le nombre de joueurs n'est pas un diviseur du nombre de territoires
function placementInitCasAsymétrique(Id,carte){
	var n = 0
	
}


//Gestion du stock de départ
function originalStock(nbPlayers){
	return 50-5*nbPlayers
}


//Attribution des couleurs
var colors = ['00FF00','FF00FF','FF0000','FFFF00','0000FF','00FFFF','787878','FFFFFF']
function changeColorFunction(){
	color = '#'+colors[0]
	colors.shift();
	return color;
}

//Fonction initialisation des voisins
function getVoisins(name){
	if(name=="eastern_australia"){return ["western_australia","new_guinea","indonesia"]}
	if(name=="western_australia"){return ["eastern_australia","new_guinea","indonesia"]}
	if(name=="new_guinea"){return ["western_australia","eastern_australia","indonesia"]}
	if(name=="indonesia"){return ["western_australia","new_guinea","siam"]}
	if(name=="siam"){return ["indonesia","india","china"]}
	if(name=="india"){return ["siam","china","afghanistan","middle_east"]}
	if(name=="middle_east"){return ["russia","east_africa","egypt","afghanistan","india","southern_europe"]}
	if(name=="afghanistan"){return ["middle_east","india","china","russia","ural"]}
	if(name=="china"){return ["afghanistan","siam","india","ural","siberia","mongolia"]}
	if(name=="mongolia"){return ["china","siberia","japan","kamchatka","irkutsk"]}
	if(name=="japan"){return ["kamchatka","mongolia"]}
	if(name=="siberia"){return ["ural","china","mongolia","yakursk","irkutsk"]}
	if(name=="ural"){return ["russia","afghanistan","china","siberia"]}
	if(name=="irkutsk"){return ["mongolia","siberia","kamchatka","yakursk"]}
	if(name=="yakursk"){return ["irkutsk","kamchatka","siberia"]}
	if(name=="kamchatka"){return ["irkutsk","yakursk","japan","mongolia","alaska"]}
	if(name=="russia"){return ["ural","afghanistan","middle_east","southern_europe","northern_europe","scandinavia"]}
	if(name=="scandinavia"){return ["russia","iceland","great_britain","northern_europe"]}
	if(name=="northern_europe"){return ["southern_europe","russia","scandinavia","western_europe","great_britain"]}
	if(name=="southern_europe"){return ["egypt","north_africa","middle_east","western_europe","russia"]}
	if(name=="western_europe"){return ["north_africa","great_britain","southern_europe","northern_europe"]}
	if(name=="great_britain"){return ["western_europe","iceland","scandinavia","northern_europe"]}
	if(name=="iceland"){return ["great_britain","northern_europe","scandinavia","greenland"]}
	if(name=="greenland"){return ["iceland","northwest_territory","ontario","quebec"]}
	if(name=="northwest_territory"){return ["alaska","ontario","greenland","alberta"]}
	if(name=="alaska"){return ["northwest_territory","alberta","kamchatka"]}
	if(name=="alberta"){return ["alaska","northwest_territory","ontario","western_united_states"]}
	if(name=="ontario"){return ["western_united_states","alberta","quebec","eastern_united_states","northwest_territory","greenland"]}
	if(name=="quebec"){return ["greenland","ontario","eastern_united_states"]}
	if(name=="eastern_united_states"){return ["western_united_states","ontario","quebec","central_america"]}
	if(name=="western_united_states"){return ["alberta","ontario","central_america","eastern_united_states"]}
	if(name=="central_america"){return ["western_united_states","eastern_united_states","venezuela"]}
	if(name=="venezuela"){return ["central_america","brazil","peru"]}
	if(name=="peru"){return ["brazil","venezuela","argentina"]}
	if(name=="brazil"){return ["peru","venezuela","argentina","north_africa"]}
	if(name=="argentina"){return ["peru","brazil"]}
	if(name=="north_africa"){return ["brazil","western_europe","southern_europe","egypt","east_africa","congo"]}
	if(name=="egypt"){return ["southern_europe","middle_east","north_africa","east_africa"]}
	if(name=="east_africa"){return ["egypt","middle_east","north_africa","congo","madagascar","south_africa"]}
	if(name=="madagascar"){return ["south_africa","east_africa"]}
	if(name=="south_africa"){return ["madagascar","congo","east_africa"]}
	if(name=="congo"){return ["south_africa","north_africa","east_africa"]}
}

//	calcul des renforts
	 function calculRenforts(Id,carte){
		var nbTerritoires = 0
		var NA = 0
		var SA = 0
		var EU = 0
		var Oceanie = 0
		var Asie = 0
		var Afrique = 0
		carte.forEach((territoire)=>{
			if(territoire.proprietaire==Id){
				nbTerritoires++
				if(territoire.continent=="NA"){NA++}
				if(territoire.continent=="SA"){SA++}
				if(territoire.continent=="EU"){EU++}
				if(territoire.continent=="Oceanie"){Oceanie++}
				if(territoire.continent=="Afrique"){Afrique++}
				if(territoire.continent=="Asie"){Asie++}			
				}
			})
		var total = Math.floor(nbTerritoires/3)
		if(NA==9){total+=5}
		if(SA==4){total+=2}
		if(EU==7){total+=5}
		if(Oceanie==4){total+=2}
		if(Asie==12){total+=7}
		if(Afrique==6){total+=3}
		if(total>3){return total}
		else{return 3}
	}


//========================= FONCTIONS LIEES AU DEPLACEMENT ET AU COMBAT =========================//


// Savoir s'il y a un ennemi limitrophe
function Deplacement_ennemiLimitrophe(Territoire){
	if (Territoire.army < 2) {return false}
    for (var i=0 ; i < Territoire.voisins.length ; i++){
        if (Territoire.proprietaire != Territoire.voisins[i].proprietaire ){
            return true
        }
    }
    return false
}

//Savoir si il y a un allié limitrophe
function Deplacement_voisinLimitrophe(Territoire){
	for (var i=0 ; i < Territoire.voisins.length ; i++){
        if (Territoire.proprietaire == Territoire.voisins[i].proprietaire ){
            return true
        }
    }
    return false
}


//Savoir si un territoire se trouve parmi une liste
function Deplacement_estPresent(Territoire,liste){
    for(var i =0;i < liste.length;i++){
        if (liste[i].nom == Territoire.nom){
            return true
        }
    }
    return false
}

//Renvoie la liste des terrioires voisins avec même propriétaire
function Deplacement_voisinsMemeProprio(Territoire){
    voisins = []
    for (var i =0 ; i < Territoire.voisins.length ; i++){
        if (Territoire.proprietaire == Territoire.voisins[i].proprietaire ){
            voisins.push(Territoire.voisins[i])
        }
    }
    return voisins
}

//Envoie un boolean qui indique si il existe un chemin entre les territoires
function Deplacement_sontRelies(Territoire1,Territoire2){
    var status = false;
    var passes = [];
    var encours = [];
    encours.push(Territoire1);
    while( !status && (encours.length != 0) ){
        var terri = encours.shift()
        passes.push(terri)
        var voisinsMemeProprio = Deplacement_voisinsMemeProprio(terri)
        for (var i = 0; i < voisinsMemeProprio.length;i++){
            if (voisinsMemeProprio[i].nom == Territoire2.nom){
                return true
            }
            var presentEnCours = Deplacement_estPresent(voisins[i],encours)
            var presentPasses = Deplacement_estPresent(voisins[i],passes)
            if (!presentEnCours && !presentPasses){
                encours.push(voisins[i])
            }
        }
    }
    return false
}
//Indique si le déplacement est autorisé
function IsDeplacement_possible(Territoire1,Territoire2){
    var possible = Deplacement_sontRelies(Territoire1,Territoire2)
	if(possible && Territoire1!=Territoire2){
        var max = Territoire1.army - 1
		return [true,max]
    }
    return [false,-1]
}

//fonctions qui vont voir si le combat est possible initialement
// Savoir si 2 territoires sont voisins
function Combat_estVoisin(Territoire1,Territoire2){
    for(var i =0 ; i < Territoire1.voisins.length ;i++){
        if (Territoire1.voisins[i].nom == Territoire2.nom ) {
            return true
        }
    }
    return false
}

//Savoir si l'attaque est possible
function Combat_attaquePossible (Territoire1,Territoire2) {
    var voisin = Combat_estVoisin(Territoire1,Territoire2) ;
    var assezArmees = (Territoire1.army > 1) ;
    var voisinsDifferents = (Territoire1.proprietaire != Territoire2.proprietaire);
    if (voisin && assezArmees && voisinsDifferents){
        return true
    }
    else {
        return false
    }
}

// Savoir si un deplacement est possible
function Deplacement_joueurpossedeterritoirenonisole(Id,carte) {
	var possedeterritoirenonisole = false
    carte.forEach((territoire)=>{
        if(territoire.proprietaire==Id){
            var status = Deplacement_voisinLimitrophe(territoire)
            if (status){
                possedeterritoirenonisole = true
            }
        }
    })
	return(possedeterritoirenonisole)
}

//===============================================================================================//


				